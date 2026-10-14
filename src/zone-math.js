(() => {
  const NativeDate = Date;
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  const formatters = new Map();
  const maxEpoch = 8640000000000000;

  function formatter(zone) {
    if (!formatters.has(zone)) {
      formatters.set(zone, new NativeDateTimeFormat('en-US-u-ca-gregory-nu-latn', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        era: 'short',
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
    // Anchor inside TimeClip so a valid instant can still have an out-of-range wall clock.
    const anchorDay = parts.year < 0 ? 28 : 1;
    date.setUTCFullYear(parts.year, parts.month - 1, anchorDay);
    return date.getTime() + (Math.trunc(parts.day) - anchorDay) * 86400000 +
      Math.trunc(parts.hour) * 3600000 + Math.trunc(parts.minute) * 60000 +
      Math.trunc(parts.second) * 1000 + Math.trunc(parts.millisecond);
  }

  function getWallParts(epochMs, zone) {
    if (!Number.isFinite(epochMs) || Math.abs(epochMs) > maxEpoch) throw new RangeError('Invalid time value');
    const values = {};
    for (const part of formatter(zone).formatToParts(new NativeDate(epochMs))) {
      if (part.type === 'era') values.era = part.value;
      else if (part.type !== 'literal') values[part.type] = Number(part.value);
    }
    const wall = {
      year: values.era === 'BC' ? 1 - values.year : values.year,
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
      const sample = desired + hours * 3600000;
      if (Math.abs(sample) <= maxEpoch) offsets.add(getWallParts(sample, zone).offsetMinutes);
    }
    const candidates = [...offsets].map(offset => desired + offset * 60000)
      .filter(epoch => Math.abs(epoch) <= maxEpoch);
    if (!candidates.length) return NaN;
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
