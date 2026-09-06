import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import ExpoZxingScanner from '../../modules/expo-zxing-scanner';
import { isValidIsbn, normalizeIsbn } from '@/utils/isbn';

type Props = {
  disabled?: boolean;
  onScan: (isbn: string) => void;
};

const ANDROID_INITIAL_SCAN_DELAY_MS = 250;
const ANDROID_SCAN_INTERVAL_MS = 450;

export default function BarcodeScannerButton({ disabled = false, onScan }: Props) {
  const { t } = useTranslation();
  const cameraRef = React.useRef<CameraView>(null);
  const [visible, setVisible] = React.useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = React.useState<string | undefined>();
  const [handled, setHandled] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);

  const close = React.useCallback(() => {
    setVisible(false);
    setHandled(false);
    setCameraReady(false);
    setScanError(undefined);
  }, []);

  const handleBarcodeData = React.useCallback(
    (data: string) => {
      if (handled) return;
      const normalized = normalizeIsbn(data);
      if (normalized.length !== 13 || !isValidIsbn(normalized)) {
        setScanError(t('books.scanner.invalidBarcode'));
        return;
      }
      setHandled(true);
      onScan(normalized);
      close();
    },
    [close, handled, onScan, t]
  );

  const handleNativeBarcode = React.useCallback(
    ({ data }: BarcodeScanningResult) => handleBarcodeData(data),
    [handleBarcodeData]
  );

  React.useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !visible ||
      !permission?.granted ||
      !cameraReady ||
      handled
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      timer = setTimeout(() => void scanFrame(), delay);
    };

    const scanFrame = async () => {
      if (cancelled) return;
      let photoUri: string | undefined;

      try {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.45,
          shutterSound: false,
        });
        photoUri = photo?.uri;
        if (!photoUri || cancelled) return;

        const barcode = await ExpoZxingScanner.scanImageAsync(photoUri);
        if (!cancelled && barcode) handleBarcodeData(barcode);
      } catch {
        // A single camera/decode failure should not end the scanning session.
      } finally {
        if (photoUri) {
          try {
            new File(photoUri).delete();
          } catch {
            // Camera cache files are best-effort cleanup only.
          }
        }
        if (!cancelled) schedule(ANDROID_SCAN_INTERVAL_MS);
      }
    };

    schedule(ANDROID_INITIAL_SCAN_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cameraReady, handleBarcodeData, handled, permission?.granted, visible]);

  if (Platform.OS === 'web') return null;

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        disabled={disabled}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
      >
        <Text style={styles.buttonText}>{t('books.scanner.scanBarcode')}</Text>
      </Pressable>

      <Modal visible={visible} animationType="slide" onRequestClose={close}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('books.scanner.title')}</Text>
            <Pressable onPress={close} accessibilityRole="button" style={styles.closeButton}>
              <Text style={styles.closeText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>

          {!permission ? (
            <View style={styles.messageBox}>
              <Text>{t('books.scanner.checkingPermission')}</Text>
            </View>
          ) : !permission.granted ? (
            <View style={styles.messageBox}>
              <Text style={styles.messageTitle}>{t('books.scanner.permissionNeeded')}</Text>
              <Text style={styles.messageText}>{t('books.scanner.manualFallback')}</Text>
              {permission.canAskAgain ? (
                <Pressable
                  onPress={() => void requestPermission()}
                  accessibilityRole="button"
                  style={styles.permissionButton}
                >
                  <Text style={styles.permissionButtonText}>{t('books.scanner.allowCamera')}</Text>
                </Pressable>
              ) : (
                <Text style={styles.messageText}>{t('books.scanner.permissionDisabled')}</Text>
              )}
            </View>
          ) : (
            <View style={styles.cameraArea}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                animateShutter={false}
                onCameraReady={() => setCameraReady(true)}
                barcodeScannerSettings={Platform.OS === 'ios' ? { barcodeTypes: ['ean13'] } : undefined}
                onBarcodeScanned={Platform.OS === 'ios' && !handled ? handleNativeBarcode : undefined}
              />
              <View style={styles.guide} pointerEvents="none">
                <View style={styles.guideBox} />
                <Text style={styles.guideText}>{t('books.scanner.alignBarcode')}</Text>
              </View>
            </View>
          )}
          {!!scanError && <Text style={styles.errorText}>{scanError}</Text>}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderColor: '#666', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
  container: { flex: 1, backgroundColor: '#111' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700' },
  closeButton: { paddingHorizontal: 12, paddingVertical: 10 },
  closeText: { fontSize: 16, fontWeight: '600' },
  cameraArea: { flex: 1 },
  guide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 },
  guideBox: { width: '90%', maxWidth: 440, aspectRatio: 2.2, borderWidth: 3, borderColor: '#fff', borderRadius: 12 },
  guideText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', padding: 8 },
  messageBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: '#fff' },
  messageTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  messageText: { fontSize: 15, lineHeight: 21, color: '#555', textAlign: 'center' },
  permissionButton: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1f6feb' },
  permissionButtonText: { color: '#fff', fontWeight: '700' },
  errorText: { color: '#fff', backgroundColor: '#b00020', padding: 12, textAlign: 'center' },
});
