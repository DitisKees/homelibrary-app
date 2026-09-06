/* global migrate, Collection */

migrate((app) => {
  const authenticated = '@request.auth.id != ""';

  // PocketBase 0.40.x initializes a default `users` auth collection.
  // Configure that collection instead of attempting to create a duplicate.
  const users = app.findCollectionByNameOrId('users');
  users.listRule = authenticated;
  users.viewRule = authenticated;
  users.createRule = null;
  users.updateRule = 'id = @request.auth.id';
  users.deleteRule = null;
  users.manageRule = null;
  users.passwordAuth.enabled = true;
  users.passwordAuth.identityFields = ['email'];
  app.save(users);

  const books = new Collection({
    type: 'base',
    name: 'books',
    listRule: authenticated,
    viewRule: authenticated,
    createRule: authenticated,
    updateRule: authenticated,
    deleteRule: authenticated,
    fields: [
      {
        type: 'text',
        name: 'title',
        required: true,
        max: 500,
      },
      {
        type: 'text',
        name: 'author',
        max: 500,
      },
      {
        type: 'text',
        name: 'isbn10',
        max: 10,
      },
      {
        type: 'text',
        name: 'isbn13',
        max: 13,
      },
      {
        type: 'text',
        name: 'publisher',
        max: 500,
      },
      {
        type: 'number',
        name: 'publishedYear',
        min: 0,
        max: 9999,
        onlyInt: true,
      },
      {
        type: 'editor',
        name: 'description',
      },
      {
        type: 'file',
        name: 'cover',
        maxSelect: 1,
        maxSize: 10485760,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
        thumbs: ['80x120'],
      },
      {
        type: 'text',
        name: 'location',
        max: 500,
      },
      {
        type: 'relation',
        name: 'owner',
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
    ],
    indexes: [
      'CREATE INDEX idx_books_title ON books (title)',
      'CREATE INDEX idx_books_author ON books (author)',
      'CREATE INDEX idx_books_isbn10 ON books (isbn10)',
      'CREATE INDEX idx_books_isbn13 ON books (isbn13)',
    ],
  });
  app.save(books);

  const readingStatus = new Collection({
    type: 'base',
    name: 'reading_status',
    listRule: `${authenticated} && user = @request.auth.id`,
    viewRule: `${authenticated} && user = @request.auth.id`,
    createRule: `${authenticated} && @request.body.user = @request.auth.id`,
    updateRule: `${authenticated} && user = @request.auth.id && @request.body.user:isset = false`,
    deleteRule: `${authenticated} && user = @request.auth.id`,
    fields: [
      {
        type: 'relation',
        name: 'user',
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: 'relation',
        name: 'book',
        required: true,
        collectionId: books.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: 'select',
        name: 'status',
        required: true,
        maxSelect: 1,
        values: ['want_to_read', 'reading', 'finished'],
      },
      {
        type: 'date',
        name: 'startedAt',
      },
      {
        type: 'date',
        name: 'finishedAt',
      },
      {
        type: 'number',
        name: 'rating',
        min: 1,
        max: 5,
        onlyInt: true,
      },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_reading_status_user_book ON reading_status (user, book)',
      'CREATE INDEX idx_reading_status_status ON reading_status (status)',
    ],
  });
  app.save(readingStatus);

  const loans = new Collection({
    type: 'base',
    name: 'loans',
    listRule: authenticated,
    viewRule: authenticated,
    createRule: `${authenticated} && @request.body.lentBy = @request.auth.id`,
    updateRule: authenticated,
    deleteRule: authenticated,
    fields: [
      {
        type: 'relation',
        name: 'book',
        required: true,
        collectionId: books.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      {
        type: 'relation',
        name: 'lentBy',
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false,
      },
      {
        type: 'text',
        name: 'borrowerName',
        required: true,
        max: 500,
      },
      {
        type: 'text',
        name: 'borrowerContact',
        max: 500,
      },
      {
        type: 'date',
        name: 'dateLent',
        required: true,
      },
      {
        type: 'date',
        name: 'dateDue',
      },
      {
        type: 'date',
        name: 'dateReturned',
      },
      {
        type: 'editor',
        name: 'notes',
      },
    ],
    indexes: [
      'CREATE INDEX idx_loans_book ON loans (book)',
      'CREATE INDEX idx_loans_lent_by ON loans (lentBy)',
      'CREATE INDEX idx_loans_date_returned ON loans (dateReturned)',
    ],
  });
  app.save(loans);
}, (app) => {
  for (const name of ['loans', 'reading_status', 'books']) {
    try {
      const collection = app.findCollectionByNameOrId(name);
      app.delete(collection);
    } catch {
      // Allow a partial rollback when a collection was already removed manually.
    }
  }
});
