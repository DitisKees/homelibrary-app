/* global migrate, Record */
// Intentionally applied ONLY by demo/Dockerfile, after all production migrations.
migrate((app) => {
  const users = app.findCollectionByNameOrId('users');

  // Shared public accounts may authenticate, but must not be able to rename
  // themselves or change their publicly documented passwords.
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  app.save(users);

  const books = app.findCollectionByNameOrId('books');
  // A lower limit bounds storage abuse on Koyeb's 2 GB ephemeral disk.
  books.fields.getByName('cover').maxSize = 2 * 1024 * 1024;
  app.save(books);

  const settings = app.settings();
  settings.meta.appName = 'HomeLibrary Public Demo';
  settings.meta.hideControls = true;
  settings.backups.cron = '';
  settings.backups.cronMaxKeep = 0;
  settings.logs.maxDays = 1;
  settings.logs.logIP = false;
  settings.logs.logAuthId = false;
  settings.batch.enabled = false;
  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: '*:auth', duration: 60, maxRequests: 10 },
    { label: '*:create', duration: 60, maxRequests: 30 },
    { label: '/api/', duration: 60, maxRequests: 240 },
  ];
  app.save(settings);

  // Prevent PocketBase's first-run superuser installer from being available
  // on the public API. There is deliberately no known/admin password.
  const superusers = app.findCollectionByNameOrId('_superusers');
  const admin = new Record(superusers);
  admin.set('email', 'demo-admin@example.invalid');
  admin.setRandomPassword();
  app.save(admin);

  const demoEmails = ['demo1@example.invalid', 'demo2@example.invalid'];
  const demoUsers = demoEmails.map((email) => {
    const record = new Record(users);
    record.set('email', email);
    record.set('verified', true);
    record.setPassword('HomeLibrary-Demo-2026!');
    app.save(record);
    return record;
  });

  // Fictional catalog records; no personal data or copied book cover files.
  const samples = [
    ['Pride and Prejudice', 'Jane Austen', 1813, 'Living room'],
    ['Emma', 'Jane Austen', 1815, 'Living room'],
    ['Frankenstein', 'Mary Shelley', 1818, 'Study'],
    ['Jane Eyre', 'Charlotte Brontë', 1847, 'Study'],
    ['Wuthering Heights', 'Emily Brontë', 1847, 'Study'],
    ['Moby-Dick', 'Herman Melville', 1851, 'Living room'],
    ['A Tale of Two Cities', 'Charles Dickens', 1859, 'Living room'],
    ['Little Women', 'Louisa May Alcott', 1868, 'Bedroom'],
    ['Around the World in Eighty Days', 'Jules Verne', 1872, 'Study'],
    ['The Adventures of Tom Sawyer', 'Mark Twain', 1876, 'Bedroom'],
    ['The Picture of Dorian Gray', 'Oscar Wilde', 1890, 'Study'],
    ['The Time Machine', 'H. G. Wells', 1895, 'Study'],
    ['Dracula', 'Bram Stoker', 1897, 'Living room'],
    ['The Wonderful Wizard of Oz', 'L. Frank Baum', 1900, 'Bedroom'],
    ['Anne of Green Gables', 'L. M. Montgomery', 1908, 'Bedroom'],
    ['The Secret Garden', 'Frances Hodgson Burnett', 1911, 'Bedroom'],
  ];
  const seededBooks = samples.map(([title, author, publishedYear, location], index) => {
    const record = new Record(books);
    record.set('title', title);
    record.set('author', author);
    record.set('publishedYear', publishedYear);
    record.set('location', location);
    record.set('owner', demoUsers[index % demoUsers.length].id);
    app.save(record);
    return record;
  });

  const statuses = app.findCollectionByNameOrId('reading_status');
  const addReading = (user, book, status, rating) => {
    const record = new Record(statuses);
    record.set('user', user.id);
    record.set('book', book.id);
    record.set('status', status);
    if (rating) record.set('rating', rating);
    app.save(record);
  };
  addReading(demoUsers[0], seededBooks[0], 'finished', 5);
  addReading(demoUsers[0], seededBooks[2], 'reading');
  addReading(demoUsers[0], seededBooks[5], 'want_to_read');
  addReading(demoUsers[1], seededBooks[1], 'reading');
  addReading(demoUsers[1], seededBooks[6], 'finished', 4);

  const loans = app.findCollectionByNameOrId('loans');
  const dateDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const addLoan = (book, lender, name, lentDaysAgo, returnedDaysAgo) => {
    const record = new Record(loans);
    record.set('book', book.id);
    record.set('lentBy', lender.id);
    record.set('borrowerName', name);
    record.set('dateLent', dateDaysAgo(lentDaysAgo));
    if (returnedDaysAgo !== null) record.set('dateReturned', dateDaysAgo(returnedDaysAgo));
    app.save(record);
  };
  addLoan(seededBooks[3], demoUsers[0], 'Alex Example', 14, null);
  addLoan(seededBooks[4], demoUsers[1], 'Taylor Example', 45, 7);
});
