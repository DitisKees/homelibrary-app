const { withGradleProperties } = require('expo/config-plugins');

// ImagePicker requires WRITE_EXTERNAL_STORAGE for camera capture below API 29.
// Support Android 10+ so camera capture needs only CAMERA permission.
module.exports = function withAndroidPermissions(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (entry) => entry.type !== 'property' || entry.key.trim() !== 'android.minSdkVersion',
    );
    config.modResults.push({ type: 'property', key: 'android.minSdkVersion', value: '29' });
    return config;
  });
};
