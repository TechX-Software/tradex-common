import * as moment from 'moment';

const DISPLAY_FORMAT = 'YYYYMMDD';
const DATETIME_DISPLAY_FORMAT = 'YYYYMMDDhhmmss'


const formatDateToDisplay = (date: Date, format: string = DISPLAY_FORMAT): string => {
  try {
    const obj = moment(date);
    if (obj.isValid()) {
      return moment(date).format(format);
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
};

const convertStringToDate = (data: string, format: string = DISPLAY_FORMAT): Date => {
  try {
    return moment(data, format).toDate();
  } catch (e) {
    return null;
  }
};

export { formatDateToDisplay, convertStringToDate, DATETIME_DISPLAY_FORMAT }