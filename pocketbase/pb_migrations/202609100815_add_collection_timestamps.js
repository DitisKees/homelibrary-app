/* global migrate, AutodateField */

const timestampedCollections = ['books', 'reading_status', 'loans'];

migrate((app) => {
  for (const name of timestampedCollections) {
    const collection = app.findCollectionByNameOrId(name);
    const fieldNames = collection.fields.fieldNames();

    if (!fieldNames.includes('created')) {
      collection.fields.add(new AutodateField({
        name: 'created',
        onCreate: true,
      }));
    }

    if (!fieldNames.includes('updated')) {
      collection.fields.add(new AutodateField({
        name: 'updated',
        onCreate: true,
        onUpdate: true,
      }));
    }

    app.save(collection);
  }
});
