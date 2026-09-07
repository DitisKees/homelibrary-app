const serverTranslations = {
  en: {
    server: {
      setup: {
        title: 'Connect to your library server',
        help: 'Enter the HTTPS URL of the PocketBase server that hosts your HomeLibrary.',
        selfHost: 'No server yet? Read the HomeLibrary self-hosting guide.',
        urlLabel: 'PocketBase server URL',
        save: 'Test and save server',
        testing: 'Testing server…',
      },
      settings: {
        heading: 'Library server',
        help: 'Change the PocketBase server used by this app. Changing servers signs you out and clears data from the previous server.',
        reset: 'Reset to deployment default',
        resetSuccess: 'Server reset to the deployment default. Please sign in again.',
        resetError: 'Unable to reset the server. Try again.',
        updateError: 'Unable to update the server. Try again.',
      },
      errors: {
        invalidUrl: 'Enter a valid PocketBase server URL.',
        insecureUrl: 'For security, release builds require HTTPS. Plain HTTP is only allowed for local development servers.',
        unreachable: 'This server could not be reached. Check the URL and connection.',
        serverResponse: 'The server responded unexpectedly. Check that it is a PocketBase server.',
        testFailed: 'Unable to test this server. Try again.',
      },
    },
  },
  nl: {
    server: {
      setup: {
        title: 'Verbinden met je bibliotheekserver',
        help: 'Voer de HTTPS-URL in van de PocketBase-server waarop je HomeLibrary draait.',
        selfHost: 'Nog geen server? Lees de handleiding voor het zelf hosten van HomeLibrary.',
        urlLabel: 'PocketBase-server-URL',
        save: 'Server testen en opslaan',
        testing: 'Server testen…',
      },
      settings: {
        heading: 'Bibliotheekserver',
        help: 'Wijzig de PocketBase-server die deze app gebruikt. Als je van server wisselt, word je uitgelogd en worden gegevens van de vorige server uit de lokale cache verwijderd.',
        reset: 'Terugzetten naar standaardserver',
        resetSuccess: 'De server is teruggezet naar de standaardconfiguratie. Log opnieuw in.',
        resetError: 'De server kon niet worden teruggezet. Probeer het opnieuw.',
        updateError: 'De server kon niet worden bijgewerkt. Probeer het opnieuw.',
      },
      errors: {
        invalidUrl: 'Voer een geldige URL voor de PocketBase-server in.',
        insecureUrl: 'Voor de veiligheid vereisen release-builds HTTPS. Onversleuteld HTTP is alleen toegestaan voor lokale ontwikkelservers.',
        unreachable: 'Deze server kon niet worden bereikt. Controleer de URL en je verbinding.',
        serverResponse: 'De server gaf een onverwacht antwoord. Controleer of dit een PocketBase-server is.',
        testFailed: 'Deze server kon niet worden getest. Probeer het opnieuw.',
      },
    },
  },
  de: {
    server: {
      setup: {
        title: 'Mit dem Bibliotheksserver verbinden',
        help: 'Gib die HTTPS-URL des PocketBase-Servers ein, auf dem deine HomeLibrary läuft.',
        selfHost: 'Noch kein Server? Lies die Anleitung zum Self-Hosting von HomeLibrary.',
        urlLabel: 'PocketBase-Server-URL',
        save: 'Server testen und speichern',
        testing: 'Server wird getestet…',
      },
      settings: {
        heading: 'Bibliotheksserver',
        help: 'Ändere den PocketBase-Server, den diese App verwendet. Beim Serverwechsel wirst du abgemeldet und lokale Daten des vorherigen Servers werden gelöscht.',
        reset: 'Auf Bereitstellungsstandard zurücksetzen',
        resetSuccess: 'Der Server wurde auf den Bereitstellungsstandard zurückgesetzt. Bitte melde dich erneut an.',
        resetError: 'Der Server konnte nicht zurückgesetzt werden. Versuche es erneut.',
        updateError: 'Der Server konnte nicht aktualisiert werden. Versuche es erneut.',
      },
      errors: {
        invalidUrl: 'Gib eine gültige PocketBase-Server-URL ein.',
        insecureUrl: 'Aus Sicherheitsgründen benötigen Release-Builds HTTPS. Unverschlüsseltes HTTP ist nur für lokale Entwicklungsserver erlaubt.',
        unreachable: 'Dieser Server konnte nicht erreicht werden. Prüfe URL und Verbindung.',
        serverResponse: 'Der Server hat unerwartet geantwortet. Prüfe, ob es sich um einen PocketBase-Server handelt.',
        testFailed: 'Dieser Server konnte nicht getestet werden. Versuche es erneut.',
      },
    },
  },
  fr: {
    server: {
      setup: {
        title: 'Se connecter au serveur de bibliothèque',
        help: 'Saisissez l’URL HTTPS du serveur PocketBase qui héberge votre HomeLibrary.',
        selfHost: 'Pas encore de serveur ? Consultez le guide d’auto-hébergement de HomeLibrary.',
        urlLabel: 'URL du serveur PocketBase',
        save: 'Tester et enregistrer le serveur',
        testing: 'Test du serveur…',
      },
      settings: {
        heading: 'Serveur de bibliothèque',
        help: 'Modifiez le serveur PocketBase utilisé par cette application. Changer de serveur vous déconnecte et efface les données locales de l’ancien serveur.',
        reset: 'Rétablir le serveur par défaut',
        resetSuccess: 'Le serveur par défaut a été rétabli. Veuillez vous reconnecter.',
        resetError: 'Impossible de rétablir le serveur. Réessayez.',
        updateError: 'Impossible de mettre à jour le serveur. Réessayez.',
      },
      errors: {
        invalidUrl: 'Saisissez une URL de serveur PocketBase valide.',
        insecureUrl: 'Pour des raisons de sécurité, les versions de production exigent HTTPS. HTTP non chiffré n’est autorisé que pour les serveurs de développement locaux.',
        unreachable: 'Ce serveur est inaccessible. Vérifiez l’URL et la connexion.',
        serverResponse: 'Le serveur a répondu de manière inattendue. Vérifiez qu’il s’agit bien d’un serveur PocketBase.',
        testFailed: 'Impossible de tester ce serveur. Réessayez.',
      },
    },
  },
} as const;

export default serverTranslations;
