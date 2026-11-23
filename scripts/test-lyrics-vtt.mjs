import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseVTT,activeCueIndex} from '../src/lyrics/vtt.ts';

test('parses WebVTT with BOM, cue IDs, CRLF and hour timestamps', () => {
  const cues = parseVTT('\uFEFFWEBVTT\r\n\r\ncue-1\r\n00:01.500 --> 00:03.000 align:start\r\nHola\r\nmundo\r\n\r\n00:01:04.000 --> 00:01:06.000\r\nVerso 2\r\n');
  assert.deepEqual(cues, [{start:1.5,end:3,text:'Hola\nmundo'},{start:64,end:66,text:'Verso 2'}]);
});
test('does not treat comments or cue IDs as lyrics', () => {
  assert.deepEqual(parseVTT('WEBVTT\n\nNOTE metadata\nsecret\n\nverse-id\n00:02.000 --> 00:04.000\nCanto\n'), [{start:2,end:4,text:'Canto'}]);
});
test('skips malformed timestamps, empty lyrics and inverted cues', () => {
  assert.deepEqual(parseVTT('WEBVTT\n\n00:71.000 --> 00:72.000\nBad\n\n00:05.000 --> 00:02.000\nBack\n\n00:02.000 --> 00:03.000\n\n00:03.000 --> 00:04.000\nGood'), [{start:3,end:4,text:'Good'}]);
});
test('highlights correct cue, clears after grace interval', () => {
  const cues = parseVTT('WEBVTT\n\n00:01.000 --> 00:02.000\nA\n\n00:04.000 --> 00:05.000\nB');
  assert.equal(activeCueIndex(cues,0.5),-1);
  assert.equal(activeCueIndex(cues,1.5),0);
  assert.equal(activeCueIndex(cues,4.5),1);
  assert.equal(activeCueIndex(cues,7.1),-1);
  assert.equal(activeCueIndex(cues,Number.NaN),-1);
});