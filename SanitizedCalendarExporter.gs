var whoAmI = "gretta@google.com";

function advanceDate(today, day_index) {
  var date = new Date(today.getTime() + (day_index * 24 * 60 * 60 * 1000));
  
  date.setHours(0, 0, 0, 0);
  return date;
}

function getTodayDateForCalendar(calendar) {
  var today = new Date();  // in the script timezone.
  var timezone = calendar.getTimeZone();
  
  // Need to format and then parse back to apply the timezone.
  // No other way to do it!
  var formattedDate = Utilities.formatDate(today, timezone, "MMM dd, yyyy");
  return new Date(Date.parse(formattedDate));
}

function sanitizeTitle(title) {
  var sanitized_title = '';
  var safe_title_prefixes = ['breakfast', 'lunch', 'dinner', 'task', 'email', 'personal', 'gym', 'flying', 'dns', 'commute'];
  
  for (var i = 0; i < safe_title_prefixes.length; i++) {
    if (title.indexOf(safe_title_prefixes[i]) == 0) {
      sanitized_title = safe_title_prefixes[i];
      break;
    }
  }
  
  if (sanitized_title == '') {
    sanitized_title = 'meeting';
  }
  
  return sanitized_title;
}

function notGoing(event) {
  var status = event.getMyStatus();
  if (status == CalendarApp.GuestStatus.NO) {
    return true;
  } else if (status == CalendarApp.GuestStatus.OWNER) {
    var guests = event.getGuestList(true);
    for (var i = 0; i < guests.length; i++) {
      if (guests[i].getEmail() == whoAmI) {
        return (guests[i].getGuestStatus() == CalendarApp.GuestStatus.NO);
      }
    }
  } else {
    return false;
  }
}

function hashedCompare(hashed_event_1, hashed_event_2) {
  return (hashed_event_1[0] - hashed_event_2[0]);
}

function hashAndSort(events) {
  var hashed_events = [];
  
  for (var i = 0; i < events.length; i++) {
    if (notGoing(events[i])) {
      continue;
    }

    var sanitized_title = sanitizeTitle(events[i].getTitle().toLowerCase());
    var start_time = events[i].getStartTime();
    var end_time = events[i].getEndTime();
    var hash = sanitized_title + '#' +
      Utilities.formatDate(start_time, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'") + '#' +
      Utilities.formatDate(end_time, "GMT", "yyyy-MM-dd'T'HH:mm:ss'Z'");
    
    hashed_events.push([hash, events[i]]);
  }
                          
  hashed_events.sort(hashedCompare);
  return hashed_events;
}

function removeDuplicates(events_1, events_2) {
  var a = 0;
  var b = 0;
  while (a < events_1.length && b < events_2.length) {
    Logger.log('Removing duplicates');
    Logger.log('  Event 1 hash: ' + events_1[a][0]);
    Logger.log('  Event 2 hash: ' + events_2[b][0]);
    if (events_1[a][0] == events_2[b][0]) {
      // they match; remove the duplicate from both and leave the pointers alone
      Logger.log('  Match!');
      events_1.splice(a, 1);
      events_2.splice(b, 1);
    } else if (events_1[a][0] < events_2[b][0]) {
      // the first array has an element that the second one doesn't.
      // advance the first array's pointer to skip over it.
      Logger.log('  Primary calendar has this event and shadow does not.');
      a = a + 1;
    } else {
      // the second array has an element that the first one doesn't.
      // advance the second array's pointer to skip over it.
      Logger.log('  Shadow calendar has this event and primary does not.');
      b = b + 1;
    }
  }
}

function removeFalseShadows(events) {
  for (var i = 0; i < events.length; i++) {
    events[i][1].deleteEvent();
  }
}

function addMissingShadows(events, shadow_calendar) {
  for (var i = 0; i < events.length; i++) {
    var sanitized_title = sanitizeTitle(events[i][1].getTitle().toLowerCase());
    var start_time = events[i][1].getStartTime();
    var end_time = events[i][1].getEndTime();
    shadow_calendar.createEvent(sanitized_title, start_time, end_time);
  }
}

function CalendarExporter() {
  // We are working with two calendars:
  //  - the primary calendar is the full-fidelity google.com work calendar
  //  - the shadow calendar is a sanitized copy with all of the confidential details scrubbed out,
  //    suitable for sharing outside of google.com.
  var primary_calendar = CalendarApp.getDefaultCalendar();
  var shadow_calendar = CalendarApp.getCalendarById("google.com_koslfhujtpt2j5uc6upopqtqng@group.calendar.google.com");
  if (shadow_calendar == null) {
    Logger.log('Couldn\'t access shadow calendar!');
    return;
  }
  
  // We only operate over a two week period starting yesterday, to keep runtimes manageable
  var start_time = new Date();
  var today = getTodayDateForCalendar(primary_calendar);

  for (var day_index = -1; day_index < 13; day_index++) {
    var day = advanceDate(today, day_index);
    Logger.log('******Now working on date ' + day);
    var primary_events = primary_calendar.getEventsForDay(day);
    var shadow_events = shadow_calendar.getEventsForDay(day);
    
    // hash each event and sort the lists by the hashes
    var primary_hashed_events = hashAndSort(primary_events);
    var shadow_hashed_events = hashAndSort(shadow_events);
    
    // disregard any event that's already properly shadowed
    removeDuplicates(primary_hashed_events, shadow_hashed_events);
    
    // resolve discrepancies
    removeFalseShadows(shadow_hashed_events);
    addMissingShadows(primary_hashed_events, shadow_calendar);
  }
}

