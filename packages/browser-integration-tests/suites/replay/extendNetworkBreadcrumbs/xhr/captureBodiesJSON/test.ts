import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';
import {
  getCustomRecordingEvents,
  shouldSkipReplayTest,
  waitForReplayRequest,
} from '../../../../../utils/replayHelpers';

sentryTest(
  'captures JSON xhr requestBody & responseBody when experiment is configured',
  async ({ getLocalTestPath, page, browserName }) => {
    // These are a bit flaky on non-chromium browsers
    if (shouldSkipReplayTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    await page.route('**/foo', route => {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ res: 'this' }),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '',
        },
      });
    });

    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const requestPromise = waitForErrorRequest(page);
    const replayRequestPromise1 = waitForReplayRequest(page, 0);

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);

    void page.evaluate(() => {
      /* eslint-disable */
      const xhr = new XMLHttpRequest();

      xhr.open('POST', 'http://localhost:7654/foo');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Cache', 'no-cache');
      xhr.send('{"foo":"bar"}');

      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4) {
          // @ts-ignore Sentry is a global
          setTimeout(() => Sentry.captureException('test error', 0));
        }
      });
      /* eslint-enable */
    });

    const request = await requestPromise;
    const eventData = envelopeRequestParser(request);

    expect(eventData.exception?.values).toHaveLength(1);

    expect(eventData?.breadcrumbs?.length).toBe(1);
    expect(eventData!.breadcrumbs![0]).toEqual({
      timestamp: expect.any(Number),
      category: 'xhr',
      type: 'http',
      data: {
        method: 'POST',
        request_body_size: 13,
        response_body_size: 14,
        status_code: 200,
        url: 'http://localhost:7654/foo',
      },
    });

    const replayReq1 = await replayRequestPromise1;
    const { performanceSpans: performanceSpans1 } = getCustomRecordingEvents(replayReq1);
    expect(performanceSpans1.filter(span => span.op === 'resource.xhr')).toEqual([
      {
        data: {
          method: 'POST',
          statusCode: 200,
          request: { size: 13, body: { foo: 'bar' } },
          response: { size: 14, body: { res: 'this' } },
        },
        description: 'http://localhost:7654/foo',
        endTimestamp: expect.any(Number),
        op: 'resource.xhr',
        startTimestamp: expect.any(Number),
      },
    ]);
  },
);
