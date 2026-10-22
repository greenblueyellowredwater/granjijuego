const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const shortDayName = (dayOfMonth: number) => SHORT_DAYS[dayOfMonth % 7];
