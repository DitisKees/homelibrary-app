import { registerWebModule, NativeModule } from 'expo';

class ExpoZxingScannerModule extends NativeModule<{}> {
  async scanImageAsync(_uri: string): Promise<string | null> {
    return null;
  }
}

export default registerWebModule(ExpoZxingScannerModule, 'ExpoZxingScanner');
