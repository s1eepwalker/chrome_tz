(() => {
  const NativeDate = Date;
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  const formatters = new Map();

  function formatter(zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new NativeDateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }));
    }
    return formatters.get(zone);
  }

  function utcValue(parts) {
    const date = new NativeDate(0);
    date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
    return date.getTime();
  }

  function getWallParts(epochMs, zone) {
    if (!Number.isFinite(epochMs)) throw new RangeError('Invalid time value');
    const values = {};
    for (const part of formatter(zone).formatToParts(new NativeDate(epochMs))) {
      if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    const wall = {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second,
      millisecond: new NativeDate(epochMs).getUTCMilliseconds()
    };
    return { ...wall, offsetMinutes: (epochMs - utcValue(wall)) / 60000 };
  }

  function resolveLocal(parts, zone) {
    const desired = utcValue(parts);
    if (!Number.isFinite(desired)) return NaN;
    const offsets = new Set();
    for (const hours of [-48, -24, -12, 0, 12, 24, 48]) {
      offsets.add(getWallParts(desired + hours * 3600000, zone).offsetMinutes);
    }
    const candidates = [...offsets].map(offset => desired + offset * 60000);
    const exact = candidates.filter(epoch => utcValue(getWallParts(epoch, zone)) === desired);
    if (exact.length) return Math.min(...exact);

    const after = candidates.filter(epoch => utcValue(getWallParts(epoch, zone)) > desired);
    if (after.length) {
      return after.reduce((best, epoch) =>
        utcValue(getWallParts(epoch, zone)) < utcValue(getWallParts(best, zone)) ? epoch : best);
    }
    return Math.max(...candidates);
  }

  globalThis[Symbol.for('chromeTZ.zoneMath')] = { getWallParts, resolveLocal };
})();
