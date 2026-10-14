(() => {
  const payload = globalThis.__chromeTZPayload;
  delete globalThis.__chromeTZPayload;
  if (!payload || !['apply', 'restore'].includes(payload.mode)) return;

  const key = Symbol.for('chromeTZ.state');
  let state = globalThis[key];
  if (!state) {
    const NativeDate = globalThis.Date;
    const NativeDateTimeFormat = Intl.DateTimeFormat;
    const prototype = NativeDate.prototype;
    const originals = {};
    for (const name of [
      'getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes',
      'getSeconds', 'getMilliseconds', 'getTimezoneOffset', 'getYear',
      'setFullYear', 'setMonth', 'setDate', 'setHours', 'setMinutes',
      'setSeconds', 'setMilliseconds', 'setYear', 'toString', 'toDateString',
      'toTimeString', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'
    ]) originals[name] = prototype[name];
    state = { NativeDate, NativeDateTimeFormat, originals, zone: null,
      nativeResolvedOptions: NativeDateTimeFormat.prototype.resolvedOptions,
      formatterZones: new WeakMap(),
      getTime: prototype.getTime, setTime: prototype.setTime,
      parse: NativeDate.parse };
    Object.defineProperty(globalThis, key, { value: state, configurable: true });
  }

  const { NativeDate, NativeDateTimeFormat, originals } = state;
  const math = globalThis[Symbol.for('chromeTZ.zoneMath')];
  if (payload.mode === 'restore') {
    if (!state.zone) return;
    globalThis.Date = NativeDate;
    Intl.DateTimeFormat = NativeDateTimeFormat;
    NativeDateTimeFormat.prototype.resolvedOptions = state.nativeResolvedOptions;
    for (const [name, method] of Object.entries(originals)) NativeDate.prototype[name] = method;
    state.zone = null;
    state.installed = false;
    return;
  }
  if (!math) throw new Error('Time-zone math module is missing');
  new NativeDateTimeFormat('en-US', { timeZone: payload.timeZone });
  state.zone = payload.timeZone;
  if (state.installed) return;

  const wallOf = date => {
    const epoch = state.getTime.call(date);
    return Number.isNaN(epoch) ? null : math.getWallParts(epoch, state.zone);
  };
  const withZone = options => {
    if (options === null || (options && options.timeZone !== undefined)) return options;
    const effective = Object.create(options === undefined ? null : Object(options));
    Object.defineProperty(effective, 'timeZone', { value: state.zone, enumerable: true });
    return effective;
  };
  const two = n => String(n).padStart(2, '0');
  const three = n => String(n).padStart(3, '0');
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = wall => {
    const date = new NativeDate(0);
    date.setUTCFullYear(wall.year, wall.month - 1, wall.day);
    return date.getUTCDay();
  };
  const dateText = wall => `${weekdays[weekday(wall)]} ${months[wall.month - 1]} ${two(wall.day)} ${String(wall.year).padStart(4, '0')}`;
  const timeText = (date, wall) => {
    const signed = -wall.offsetMinutes;
    const offset = `${signed < 0 ? '-' : '+'}${two(Math.floor(Math.abs(signed) / 60))}${two(Math.abs(signed) % 60)}`;
    const label = new NativeDateTimeFormat('en-US', { timeZone: state.zone, timeZoneName: 'long' })
      .formatToParts(date).find(part => part.type === 'timeZoneName')?.value || state.zone;
    return `${two(wall.hour)}:${two(wall.minute)}:${two(wall.second)} GMT${offset} (${label})`;
  };

  const localGetters = {
    getFullYear: wall => wall.year,
    getMonth: wall => wall.month - 1,
    getDate: wall => wall.day,
    getDay: wall => weekday(wall),
    getHours: wall => wall.hour,
    getMinutes: wall => wall.minute,
    getSeconds: wall => wall.second,
    getMilliseconds: wall => wall.millisecond,
    getTimezoneOffset: wall => wall.offsetMinutes,
    getYear: wall => wall.year - 1900
  };
  for (const [name, pick] of Object.entries(localGetters)) {
    NativeDate.prototype[name] = function () {
      const wall = wallOf(this);
      return wall ? pick(wall) : NaN;
    };
  }

  const setterFields = {
    setFullYear: ['year', 'month', 'day'],
    setMonth: ['month', 'day'],
    setDate: ['day'],
    setHours: ['hour', 'minute', 'second', 'millisecond'],
    setMinutes: ['minute', 'second', 'millisecond'],
    setSeconds: ['second', 'millisecond'],
    setMilliseconds: ['millisecond']
  };
  for (const [name, fields] of Object.entries(setterFields)) {
    NativeDate.prototype[name] = function (...values) {
      if (values.length === 0) return state.setTime.call(this, NaN);
      let wall = wallOf(this);
      if (!wall && name === 'setFullYear') {
        wall = math.getWallParts(0, state.zone);
      }
      if (!wall) return NaN;
      for (let i = 0; i < Math.min(values.length, fields.length); i++) {
        wall[fields[i]] = Number(values[i]) + (fields[i] === 'month' ? 1 : 0);
      }
      const epoch = math.resolveLocal(wall, state.zone);
      return state.setTime.call(this, epoch);
    };
  }
  NativeDate.prototype.setYear = function (year) {
    const number = Number(year);
    return this.setFullYear(number >= 0 && number <= 99 ? number + 1900 : number);
  };

  NativeDate.prototype.toDateString = function () {
    const wall = wallOf(this);
    return wall ? dateText(wall) : 'Invalid Date';
  };
  NativeDate.prototype.toTimeString = function () {
    const wall = wallOf(this);
    return wall ? timeText(this, wall) : 'Invalid Date';
  };
  NativeDate.prototype.toString = function () {
    const wall = wallOf(this);
    return wall ? `${dateText(wall)} ${timeText(this, wall)}` : 'Invalid Date';
  };
  for (const name of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
    NativeDate.prototype[name] = function (locales, options) {
      return originals[name].call(this, locales, withZone(options));
    };
  }

  const localIso = /^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
  function parseDate(value) {
    const match = typeof value === 'string' ? localIso.exec(value) : null;
    if (!match) return state.parse.call(NativeDate, value);
    if (Number.isNaN(state.parse.call(NativeDate, `${value}Z`))) return NaN;
    return math.resolveLocal({
      year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
      hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0),
      millisecond: Number((match[7] || '').padEnd(3, '0'))
    }, state.zone);
  }

  const DateProxy = new Proxy(NativeDate, {
    apply() { return new NativeDate().toString(); },
    construct(target, args, newTarget) {
      if (args.length >= 2) {
        const [year, month, day = 1, hour = 0, minute = 0, second = 0, millisecond = 0] = args.map(Number);
        const localYear = year >= 0 && year <= 99 ? year + 1900 : year;
        const epoch = math.resolveLocal({ year: localYear, month: month + 1, day, hour, minute, second, millisecond }, state.zone);
        return Reflect.construct(target, [epoch], newTarget);
      }
      if (args.length === 1 && typeof args[0] === 'string' && localIso.test(args[0])) {
        return Reflect.construct(target, [parseDate(args[0])], newTarget);
      }
      return Reflect.construct(target, args, newTarget);
    },
    get(target, property, receiver) {
      if (property === 'parse') return parseDate;
      return Reflect.get(target, property, receiver);
    }
  });
  const DateTimeFormatProxy = new Proxy(NativeDateTimeFormat, {
    apply(target, thisArg, args) {
      const [locales, options] = args;
      const formatter = Reflect.apply(target, thisArg, [locales, withZone(options)]);
      if (options === undefined || (options !== null && options.timeZone === undefined)) {
        state.formatterZones.set(formatter, state.zone);
      }
      return formatter;
    },
    construct(target, args, newTarget) {
      const [locales, options] = args;
      const formatter = Reflect.construct(target, [locales, withZone(options)], newTarget);
      if (options === undefined || (options !== null && options.timeZone === undefined)) {
        state.formatterZones.set(formatter, state.zone);
      }
      return formatter;
    }
  });
  NativeDateTimeFormat.prototype.resolvedOptions = function () {
    const result = state.nativeResolvedOptions.call(this);
    const selected = state.formatterZones.get(this);
    if (selected) result.timeZone = selected;
    return result;
  };
  globalThis.Date = DateProxy;
  Intl.DateTimeFormat = DateTimeFormatProxy;
  state.installed = true;
})();
