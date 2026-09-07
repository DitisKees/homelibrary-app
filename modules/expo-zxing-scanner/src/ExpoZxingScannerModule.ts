import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoZxingScannerModule extends NativeModule<Record<string, never>> {
  scanImageAsync(uri: string): Promise<string | null>;
}

export default requireNativeModule<ExpoZxingScannerModule>('ExpoZxingScanner');
