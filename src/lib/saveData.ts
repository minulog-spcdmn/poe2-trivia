// Whether the browser asks for less data (Save-Data: a phone's data saver).
// What would only be fetched ahead of need is left out then.

/** True when the browser asks to save data. */
export const savingData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
