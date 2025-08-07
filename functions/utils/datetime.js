// functions/utils/datetime.js
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
require('dayjs/locale/th');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('th');

const BANGKOK_TZ = 'Asia/Bangkok';

const formatThaiDateTime = (date = new Date()) => {
  return dayjs(date)
    .tz(BANGKOK_TZ)
    .format('D MMM YYYY HH:mm:ss');
};

const formatDateForFile = (date = new Date()) => {
  return dayjs(date)
    .tz(BANGKOK_TZ)
    .format('DD/MM/YYYY');
};

const getCurrentTimestamp = () => {
  return dayjs().tz(BANGKOK_TZ).toISOString();
};

module.exports = {
  formatThaiDateTime,
  formatDateForFile,
  getCurrentTimestamp,
  BANGKOK_TZ
};