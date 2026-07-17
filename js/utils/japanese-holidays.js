// Flatpickr表示用の日本の祝日判定。特例年を含む主要な祝日法ルールに対応する。

const holidayCache = new Map();

function dateKey(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function keyFromDate(date) {
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function dateFromKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addHoliday(holidays, year, month, day, name) {
  holidays.set(dateKey(year, month, day), name);
}

function nthMonday(year, month, nth) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstMonday = 1 + ((8 - firstDay) % 7);
  return firstMonday + (nth - 1) * 7;
}

function vernalEquinoxDay(year) {
  if (year < 1980 || year > 2099) return null;
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year) {
  if (year < 1980 || year > 2099) return null;
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function addBaseHolidays(year, holidays) {
  if (year >= 1949) addHoliday(holidays, year, 1, 1, "元日");

  if (year >= 2000) {
    addHoliday(holidays, year, 1, nthMonday(year, 1, 2), "成人の日");
  } else if (year >= 1949) {
    addHoliday(holidays, year, 1, 15, "成人の日");
  }

  if (year >= 1967) addHoliday(holidays, year, 2, 11, "建国記念の日");
  if (year >= 2020) addHoliday(holidays, year, 2, 23, "天皇誕生日");

  const springDay = vernalEquinoxDay(year);
  if (springDay) addHoliday(holidays, year, 3, springDay, "春分の日");

  if (year >= 2007) {
    addHoliday(holidays, year, 4, 29, "昭和の日");
  } else if (year >= 1989) {
    addHoliday(holidays, year, 4, 29, "みどりの日");
  } else if (year >= 1949) {
    addHoliday(holidays, year, 4, 29, "天皇誕生日");
  }

  if (year >= 1948) addHoliday(holidays, year, 5, 3, "憲法記念日");
  if (year >= 2007) addHoliday(holidays, year, 5, 4, "みどりの日");
  if (year >= 1948) addHoliday(holidays, year, 5, 5, "こどもの日");

  if (year === 2020) {
    addHoliday(holidays, year, 7, 23, "海の日");
  } else if (year === 2021) {
    addHoliday(holidays, year, 7, 22, "海の日");
  } else if (year >= 2003) {
    addHoliday(holidays, year, 7, nthMonday(year, 7, 3), "海の日");
  } else if (year >= 1996) {
    addHoliday(holidays, year, 7, 20, "海の日");
  }

  if (year === 2020) {
    addHoliday(holidays, year, 8, 10, "山の日");
  } else if (year === 2021) {
    addHoliday(holidays, year, 8, 8, "山の日");
  } else if (year >= 2016) {
    addHoliday(holidays, year, 8, 11, "山の日");
  }

  if (year >= 2003) {
    addHoliday(holidays, year, 9, nthMonday(year, 9, 3), "敬老の日");
  } else if (year >= 1966) {
    addHoliday(holidays, year, 9, 15, "敬老の日");
  }

  const autumnDay = autumnalEquinoxDay(year);
  if (autumnDay) addHoliday(holidays, year, 9, autumnDay, "秋分の日");

  if (year === 2020) {
    addHoliday(holidays, year, 7, 24, "スポーツの日");
  } else if (year === 2021) {
    addHoliday(holidays, year, 7, 23, "スポーツの日");
  } else if (year >= 2000) {
    addHoliday(holidays, year, 10, nthMonday(year, 10, 2), year >= 2020 ? "スポーツの日" : "体育の日");
  } else if (year >= 1966) {
    addHoliday(holidays, year, 10, 10, "体育の日");
  }

  if (year >= 1948) {
    addHoliday(holidays, year, 11, 3, "文化の日");
    addHoliday(holidays, year, 11, 23, "勤労感謝の日");
  }

  if (year >= 1989 && year <= 2018) addHoliday(holidays, year, 12, 23, "天皇誕生日");
}

function addSpecialHolidays(year, holidays) {
  const specialDays = {
    1959: [[4, 10, "皇太子明仁親王の結婚の儀"]],
    1989: [[2, 24, "昭和天皇の大喪の礼"]],
    1990: [[11, 12, "即位礼正殿の儀"]],
    1993: [[6, 9, "皇太子徳仁親王の結婚の儀"]],
    2019: [
      [5, 1, "即位の日"],
      [10, 22, "即位礼正殿の儀"],
    ],
  };

  for (const [month, day, name] of specialDays[year] || []) {
    addHoliday(holidays, year, month, day, name);
  }
}

function addSubstituteHolidays(year, holidays) {
  if (year < 1973) return;

  for (const key of [...holidays.keys()].sort()) {
    const holidayDate = dateFromKey(key);
    if (holidayDate.getFullYear() !== year || holidayDate.getDay() !== 0) continue;

    let substituteDate = addDays(holidayDate, 1);
    while (
      substituteDate.getFullYear() === year
      && holidays.has(keyFromDate(substituteDate))
    ) {
      substituteDate = addDays(substituteDate, 1);
    }
    if (substituteDate.getFullYear() === year) {
      holidays.set(keyFromDate(substituteDate), "振替休日");
    }
  }
}

function addCitizensHolidays(year, holidays) {
  if (year < 1985) return;

  for (let date = new Date(year, 0, 2); date.getFullYear() === year; date = addDays(date, 1)) {
    const key = keyFromDate(date);
    if (holidays.has(key) || date.getDay() === 0) continue;
    if (holidays.has(keyFromDate(addDays(date, -1))) && holidays.has(keyFromDate(addDays(date, 1)))) {
      holidays.set(key, "国民の休日");
    }
  }
}

function buildJapaneseHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const holidays = new Map();
  addBaseHolidays(year, holidays);
  addSpecialHolidays(year, holidays);
  addSubstituteHolidays(year, holidays);
  addCitizensHolidays(year, holidays);
  holidayCache.set(year, holidays);
  return holidays;
}

export function getJapaneseHolidayName(value) {
  const date = value instanceof Date ? value : dateFromKey(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return buildJapaneseHolidays(date.getFullYear()).get(keyFromDate(date)) || "";
}
