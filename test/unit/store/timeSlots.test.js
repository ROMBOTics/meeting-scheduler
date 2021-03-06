import { EVENTS } from 'constants';
import { createStore } from '../jest/vue-utils';
import { SCHEDULE_FORM_OPTIONS } from '../jest/constants';

describe('timeSlots module events tests', () => {
  const scheduleResponse = {
    id: 'testId',
  };
  test.each([
    ['submit action should send preSchedule and schedule event', true],
    ['submit action should only send preSchedule if request failed', false],
  ])('%s', async (_, success) => {
    /**
     * Overriding request body with preSchedule event is not tested here because
     * event messenger can't actually do PostMessage in test environment out
     * of the box. Please see the test in event-messenger.test.js for testing
     * getting return values via events.
     */
    const { store } = createStore({
      modules: {
        timeSlots: {
          initState() {
            return {
              selectedSlot: {
                start: '2018-01-01T00:00:00+00:00',
                end: '2018-01-01T00:30:00+00:00',
              },
            };
          },
        },
        api: {
          actions: {
            request:
              () => (success ?
                Promise.resolve(scheduleResponse)
                : Promise.reject(new Error(''))),
          },
        },
      },
    });
    try {
      await store.dispatch('timeSlots/submit', { recaptchaToken: '' });
    } catch (e) { /* silent Promise.reject threw by api/request */ }
    const { calls } = store.messenger.send.mock;
    const message = calls[0][0];
    expect(message).toMatchObject({
      event: EVENTS.PRE_SCHEDULE,
      wait: true,
    });
    expect(message).toHaveProperty('schedule');
    expect(message).toHaveProperty('meetingWindow');

    const submitEventData = {
      event: EVENTS.SCHEDULE,
      scheduledEvent: scheduleResponse,
    };

    if (success) {
      expect(store.messenger.send).toHaveBeenNthCalledWith(2, submitEventData);
    } else {
      expect(store.messenger.send).not.toHaveBeenNthCalledWith(
        2, submitEventData,
      );
    }
  });
});

describe('timeSlots module action tests', () => {
  test('setupFormOptions test', async () => {
    const { store } = createStore();
    const expected = Object.keys(SCHEDULE_FORM_OPTIONS).reduce(
      (result, field) => {
        result[field] = SCHEDULE_FORM_OPTIONS[field].default;
        return result;
      }, {},
    );
    await store.dispatch(
      'setupFormOptions',
      { formOptions: SCHEDULE_FORM_OPTIONS, module: 'timeSlots' },
    );
    expect(store.state.timeSlots).toMatchObject(expected);
  });

  describe('submit tests', () => {
    test.each([
      [
        'Should use the default json if no return value from preSchedule event',
        undefined,
      ],
      [
        'Should use the returned json from preSchedule event',
        { start: 'start2', end: 'end2' },
      ],
    ])('%s', async (_, preScheduleEventReturnValue) => {
      const request = jest.fn();
      const event = jest.fn(() => preScheduleEventReturnValue);
      const selectedSlot = { start: 'start', end: 'end' };
      const { store } = createStore({
        modules: {
          api: {
            actions: {
              request,
            },
          },
          timeSlots: {
            initState() {
              return { selectedSlot };
            },
          },
        },
        actions: {
          event,
        },
      });
      await store.dispatch({
        type: 'timeSlots/submit',
        recaptchaToken: 'token',
      });
      const expected = preScheduleEventReturnValue || selectedSlot;
      expect(request).toHaveBeenCalled();
      const { options: { data: { start } } } = request.mock.calls[0][1];
      expect(start).toBe(expected.start);
    });
  });
});

describe('timeSlots module request data tests', () => {
  test('test request JSON schema', async () => {
    const request = jest.fn();
    const { store } = createStore({
      modules: {
        api: {
          actions: {
            request,
          },
        },
        timeSlots: {
          initState() {
            const availableSlots = [
              { start: '2010-01-01T00:00:00', end: '2010-01-01T01:00:00' },
              { start: '2010-01-01T01:00:00', end: '2010-01-01T02:00:00' },
            ];
            return {
              availableSlots,
              selectedSlot: availableSlots[1],
              name: 'name',
              email: 'email',
              extraDescription: 'extraDescription',
            };
          },
        },
      },
    });
    await store.dispatch('timeSlots/submit', { recaptchaToken: 'token' });
    expect(request).toHaveBeenCalled();
    expect(request.mock.calls[0][1].options.data).toMatchObject({
      start: '2010-01-01T01:00:00',
      end: '2010-01-01T02:00:00',
      targets: [
        {
          name: 'name',
          email: 'email',
        },
      ],
      event_metadata: {
        extra_description: 'extraDescription',
      },
      recaptcha_token: 'token',
    });
  });
});

describe('timeSlots module mutation tests', () => {
  describe('selectTimeSlot tests', () => {
    test.each([
      [
        'Should mark a slot as selected when the slot is clicked',
        [0],
        [true, false],
      ],
      [
        'Should mark a slot as unselected when the selected slot is clicked',
        [0, 0],
        [false, false],
      ],
      [
        'Should unmark previous selected slot and mark the new slot when a'
        + 'different slot is clicked',
        [0, 1],
        [false, true],
      ],
    ])('%s', (_, clicks, expectedSelects) => {
      const { store } = createStore();
      const slots = [
        {
          start: '2010-01-01T00:00:00',
          end: '2010-01-01T01:00:00',
          selected: false,
        },
        {
          start: '2010-01-01T01:00:00',
          end: '2010-01-01T02:00:00',
          selected: false,
        },
      ];
      store.commit({
        type: 'timeSlots/setTimeSlots',
        availableSlots: slots,
      });
      clicks.forEach((slotIndex) => {
        store.commit({
          type: 'timeSlots/selectTimeSlot',
          slot: slots[slotIndex],
        });
      });

      const { selectedSlot } = store.state.timeSlots;
      let hasSelected = false;
      expectedSelects.forEach((selected, slotIndex) => {
        const slot = slots[slotIndex];
        expect(slot.selected).toBe(selected);
        if (selected) {
          hasSelected = true;
          expect(selectedSlot).toBe(slot);
        }
      });

      if (!hasSelected) {
        expect(selectedSlot).toBe(null);
      }
    });
  });
});
