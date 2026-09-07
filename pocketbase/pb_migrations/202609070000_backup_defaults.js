/* global migrate */

migrate((app) => {
  const settings = app.settings();

  // Provide a safe local baseline without overriding an operator who already
  // configured a backup schedule. Off-host storage still needs to be
  // configured by the operator (for example with PocketBase backup S3).
  if (!settings.backups.cron) {
    settings.backups.cron = '0 3 * * *';
    settings.backups.cronMaxKeep = Math.max(settings.backups.cronMaxKeep || 0, 14);
    app.save(settings);
  }
});
