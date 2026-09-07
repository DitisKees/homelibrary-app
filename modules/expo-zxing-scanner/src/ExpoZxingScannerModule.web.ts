import { registerWebModule, NativeModule } from 'expo';

class ExpoZxingScannerModule extends NativeModule<Record<string, never>> {
  async scanImageAsync(uri: string): Promise<string | null> {
    void uri;
    return null;
  }
}

export default registerWebModule(ExpoZxingScannerModule, 'ExpoZxingScanner');
