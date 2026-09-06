import { parseSseBlock } from './eventSource';

describe('parseSseBlock', () => {
  test('parses PocketBase-style named events and preserves the SSE id', () => {
    expect(
      parseSseBlock('id: client-123\nevent: PB_CONNECT\ndata: {"ready":true}')
    ).toEqual({
      type: 'PB_CONNECT',
      data: '{"ready":true}',
      lastEventId: 'client-123',
    });
  });

  test('joins multi-line data and ignores SSE comments', () => {
    expect(parseSseBlock(': heartbeat\nevent: books/*\ndata: first\ndata: second')).toEqual({
      type: 'books/*',
      data: 'first\nsecond',
      lastEventId: '',
    });
  });

  test('does not dispatch blocks without data', () => {
    expect(parseSseBlock('event: PB_CONNECT\nid: client-123')).toBeUndefined();
  });
});
