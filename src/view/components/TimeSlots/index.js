/* global grecaptcha */
import moment from 'moment-timezone';
import InfiniteLoading from 'vue-infinite-loading';
import { EVENTS } from 'constants';
import { mapState } from 'vuex';
import date from '../../utils/date';
import TextInput from '../common/TextInput';
import Title from '../common/Title';
import Button from '../common/Button';


let onRecaptchaScriptLoad;
/**
* Load reCaptcha script
*
* @returns {Promise}
*/
function loadRecaptchaScript() {
  if (!onRecaptchaScriptLoad) {
    const recaptchaScript = document.createElement('script');
    // TODO: modify the language of reCAPTCHA when we enable i18n
    const lang = 'en';
    recaptchaScript.src = 'https://www.google.com/recaptcha/api.js' +
      `?onload=recaptchaLoaded&render=explicit&hl=${lang}`;
    recaptchaScript.async = true;
    recaptchaScript.defer = true;

    onRecaptchaScriptLoad = new Promise((resolve) => {
      if (typeof window !== 'undefined') {
        // window.recaptchaLoaded will be called when reCaptcha script is
        // loaded
        window.recaptchaLoaded = resolve;
      }
    });
    document.head.appendChild(recaptchaScript);
  }
  return onRecaptchaScriptLoad;
}


export default {
  name: 'TimeSlots',
  components: {
    InfiniteLoading,
    TextInput,
    Title,
    Button,
  },
  data() {
    return {
      step: 0,
      stepTitles: [
        'Choose an available time slot',
        'What\'s your name and email?',
        'Confirm your meeting details',
      ],
      isTargetFormValid: true,
      timeZone: moment.tz.guess(),
      enableRecaptcha: false,
      recaptchaId: null,
    };
  },
  computed: mapState({
    meetingWindow: state => state.meetingWindow,
    timeSlots: state => state.timeSlots,
    loading: state => state.api.loading.timeSlots,
    launchOptions: state => state.launchOptions.schedule,
    slotGroups(state) {
      const availableSlots = state.timeSlots.availableSlots || [];

      const slotGroups = {};

      availableSlots.forEach((slot) => {
        const offsetStartDate = moment(slot.start);

        const groupKey = offsetStartDate.format('YYYY-MM-DD');
        if (typeof slotGroups[groupKey] === 'undefined') {
          slotGroups[groupKey] = [];
        }
        slotGroups[groupKey].push(slot);
      });

      return slotGroups;
    },
  }),
  beforeMount() {
    if (!this.meetingWindow.id) {
      this.$store.dispatch({
        type: 'meetingWindow/getMeetingWindow',
        meetingWindowId: this.launchOptions.meetingWindowId,
      }).then(() => {
        if (this.meetingWindow.recaptchaSiteKey) {
          this.enableRecaptcha = true;
          loadRecaptchaScript().then(() => {
            const lang = 'en';
            this.recaptchaId = grecaptcha.render('recaptcha', {
              sitekey: this.meetingWindow.recaptchaSiteKey,
              size: 'invisible',
              callback: this.onRecaptchaVerify,
              'error-callback': this.onRecaptchaError,
              isolated: true,
              lang,
            });
          });
        }
      });
    }
  },
  props: [
  ],
  methods: {
    selectTimeSlot(slot, selected) {
      this.$store.commit({
        type: 'timeSlots/selectTimeSlot',
        slot,
        selected,
      });
    },
    formatDate(format, dateStr) {
      return date(format, dateStr, this.timeZone);
    },
    moveStep(step) {
      this.step += step;
    },
    updateInput(event) {
      this.$store.commit({
        type: 'timeSlots/update',
        name: event.name,
        value: event.value,
      });
    },
    afterSubmit() {
      const { afterSchedule } = this.launchOptions;
      if (afterSchedule.showResult) {
        this.$router.push('/timeSlotsCompletion/');
      } else {
        this.$store.dispatch('event', {
          event: EVENTS.CLOSE,
        });
      }
    },
    submit(recaptchaToken) {
      const promise = this.$store.dispatch('timeSlots/submit', {
        recaptchaToken,
      });
      promise.then(() => this.afterSubmit());
    },
    validateForm() {
      if (this.$refs.form.validate()) {
        this.moveStep(1);
      }
    },
    /**
     * Run after reCAPTCHA successfully verified.
     *
     * @param {string} recaptchaToken - token returned by reCAPTCHA
     */
    onRecaptchaVerify(recaptchaToken) {
      this.submit(recaptchaToken);
    },
    /**
     * Run when any error is encountered by reCAPTCHA
     */
    onRecaptchaError() {
      // There is no error message from recaptcha, the common errors may be
      // invalid site key or no internet connection.
      const message = 'Error: reCAPTCHA error. Please try again or contact ' +
        'support.';
      this.$store.commit({
        type: 'api/setErrorMessage',
        message,
      });
    },
    executeRecaptcha() {
      if (this.enableRecaptcha) {
        onRecaptchaScriptLoad.then(
          () => grecaptcha.execute(this.recaptchaId),
        );
      } else {
        this.submit();
      }
    },
    async infiniteHandler(state) {
      const hasMore = await this.$store.dispatch({
        type: 'timeSlots/getTimeSlots',
      });
      if (!this.timeSlots.availableSlots.length && !hasMore) {
        // to trigger "no-results"
        state.complete();
      } else {
        state.loaded();
        if (!hasMore) {
          // disable the infinite scroll to fetch more time slots
          // and show the message about "no more items"
          state.complete();
        }
      }
    },
  },
};
