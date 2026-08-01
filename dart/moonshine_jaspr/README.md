# moonshine_jaspr

Dart package that lowers View IR JSON to a TypeScript module importing `@tschk/crepus-moonshine`.

`emitTypeScript` does not validate the IR: it embeds the map verbatim and wraps
it in a `renderCrepusIr` call. Node kinds and the `version` value must match the
View IR the Rust parser emits (`ViewNode` and `IR_VERSION` in
`crates/crepuscularity-native/src/ir.rs` in the crepuscularity repo); anything
else is passed straight through and fails at render time.

## Usage

```dart
import 'package:moonshine_jaspr/moonshine_jaspr.dart';

final ts = emitTypeScript({
  'version': 6, // IR_VERSION shipped by @tschk/crepuscularity-wasm 0.1.1
  'root': [
    {
      'kind': 'stack',
      'axis': 'vertical',
      'children': [
        {'kind': 'text', 'content': 'hello'},
        {'kind': 'badge', 'label': 'new'},
      ],
    },
  ],
});
```

## Test

```bash
dart test
```
