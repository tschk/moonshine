import 'package:moonshine_jaspr/moonshine_jaspr.dart';
import 'package:test/test.dart';

void main() {
  test('emitTypeScript imports crepus-moonshine and embeds IR', () {
    final ts = emitTypeScript({
      'version': 1,
      'root': [
        {
          'kind': 'stack',
          'children': [
            {'kind': 'text', 'content': 'hello'},
            {
              'kind': 'sparkline',
              'values': [1, 2, 3],
            },
          ],
        },
      ],
    });

    expect(ts, contains('@tschk/crepus-moonshine'));
    expect(ts, contains('renderCrepusIr'));
    expect(ts, contains('"kind": "sparkline"'));
    expect(ts, contains('export default function CrepusApp'));
  });

  test('emitTypeScriptFromJson parses string IR', () {
    final ts = emitTypeScriptFromJson(
      '{"version":1,"root":[{"kind":"text","content":"x"}]}',
      componentName: 'Hello',
    );
    expect(ts, contains('function Hello'));
    expect(ts, contains('"content": "x"'));
  });
}
