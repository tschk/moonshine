# moonshine_jaspr

Dart package that lowers View IR JSON to a TypeScript module importing `@tschk/crepus-moonshine`.

## Usage

```dart
import 'package:moonshine_jaspr/moonshine_jaspr.dart';

final ts = emitTypeScript({
  'version': 1,
  'root': [
    {
      'kind': 'stack',
      'children': [
        {'kind': 'text', 'content': 'hello'},
        {'kind': 'sparkline', 'values': [1, 2, 3]},
      ],
    },
  ],
});
```

## Test

```bash
dart test
```
