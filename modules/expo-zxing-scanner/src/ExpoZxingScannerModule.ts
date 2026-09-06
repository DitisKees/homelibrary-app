import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoZxingScannerModule extends NativeModule<{}> {
  scanImageAsync(uri: string): Promise<string | null>;
}

export default requireNativeModule<ExpoZxingScannerModule>('ExpoZxingScanner');
