# 👥 Companion Mode: Group Meeting Finder

## Overview

The new **Group Meeting Finder** feature in Companion Mode helps you find the best time for your focus group to meet. Connect multiple calendars (school ID + personal ID) and Smart Calendar will automatically identify 2-3 common free time slots.

---

## Quick Start

### 1. Create or Join a Focus Circle

First, set up your group:

- **Create new circle**: Enter circle name → Click "Create"
- **Join existing circle**: Get invite code from a friend → Enter code and your name → Click "Join circle"
- **Invite friends**: Enter their email → Click "📧 Send invite"

### 2. Ask Members to Connect Their Calendars

Once you have at least 2 members in your circle:

1. Each member goes to **🤝 Companion Mode**
2. Scroll to **📅 Find Group Meeting Slots**
3. See list of members under **📱 Member Calendars**
4. Click **🔗 Connect** next to your name (only if not already connected)
5. Follow the Google Sign-In flow

### 3. Find Common Meeting Times

Once **at least 2 members** have connected:

1. Click **🔍 Find Best Slots (2-3)**
2. Smart Calendar analyzes everyone's calendars
3. System finds the top 3 best meeting times across the next 7 days
4. Each slot shows:
   - 📅 Date and day of week
   - 🕐 Time range and duration
   - ✅ Who's available / ✕ Who has conflicts
   - Green border if **everyone is free**

### 4. Schedule a Meeting Slot

When you find a good slot:

1. Click **📅 Schedule this slot**
2. This creates a "Group Focus Block" suggestion
3. All members get notified and can accept/decline
4. Once everyone accepts → ✅ Added to Calendar

---

## Understanding the Display

### Member Status Indicators

| Status | Meaning |
|--------|---------|
| ✅ Connected | Member linked their Google Calendar |
| 🔗 Connect | Member hasn't connected yet |
| ⏳ Awaiting login | Invitation sent, waiting for them to join |

### Meeting Slot Indicators

| Indicator | Meaning |
|-----------|---------|
| ✅ Everyone free | All group members available at this time |
| ✓ (green dot) | This member is available |
| ✕ (red dot) | This member has a conflict |
| 🕐 Duration | e.g., "1h 30m" how long the free block is |

### Slot Ranking

Slots are ranked by:

1. **How many members are free** (everyone = best)
2. **How long the block is** (longer = better for deep work)
3. **Time of day** (8am-6pm preferred for focus)

---

## Workflow Example

**Scenario**: You and a friend want to find time for a 1-hour study session

**Step 1: Create Circle**
```
Circle name: "Physics Study Group"
Member 1: You (school calendar + personal calendar)
Member 2: Friend Alex
```

**Step 2: Invite & Connect**
- Send invite to Alex@email.com
- Alex joins the circle
- Both of you connect your Google Calendars
- Status shows: "2/2 connected" ✅

**Step 3: Find Slots**
- Click "🔍 Find Best Slots (2-3)"
- System analyzes both calendars
- Results show:
  ```
  #1 Tuesday, Mar 26 | 2:00pm - 3:30pm (1h 30m) | ✅ Everyone free
  #2 Wednesday, Mar 27 | 10:00am - 11:00am (1h) | ✓ You ✓ Alex
  #3 Thursday, Mar 28 | 3:00pm - 4:00pm (1h) | ✓ You ✓ Alex
  ```

**Step 4: Schedule**
- Click "📅 Schedule this slot" for Tuesday 2pm
- Shows in "Group Focus Blocks" section
- Alex gets notification
- Alex clicks "✓ Accept"
- Once both accept → "✅ Added to Calendar"

---

## Calendar Connection

### What Gets Shared?

✅ **Shared:**
- Event times (busy/free blocks)
- Event duration
- Whether time is booked

❌ **NOT Shared:**
- Event titles or descriptions
- Personal notes
- Sensitive event details

### Multiple Calendars (School + Personal)

If you have both school and personal Google Calendars:

**Option 1: Use Primary Account**
- Sign in with your school email
- Grant access to both calendars (if in same account)

**Option 2: Connect Both Accounts**
- Click "🔗 Connect" again
- Sign in with personal email
- System combines both calendars for scheduling

### Privacy & Security

- 🔒 Tokens stored **only in your browser** (encrypted localStorage)
- 🔗 Never sent to our servers
- 🚫 Password never stored
- ✕ Click "Disconnect" anytime to revoke access

---

## Tips & Tricks

### Best Practices

1. **Update your calendar regularly** - Make sure your Google Calendar has all your classes/commitments
2. **Include both calendars** - School + personal = most accurate scheduling
3. **Set recurring blocks** - Mark regular study times as "busy" so friends don't schedule over them
4. **Check timezone** - Make sure everyone's Google Calendar has the right timezone

### Scheduling Tips

- **Avoid back-to-back** - Leave buffer time between sessions
- **Prefer mid-week** - Tues-Thu usually have fewer conflicts than Mon/Fri
- **Morning slots** - Studies show peak focus 8am-11am
- **60-90 minutes** - Optimal for deep focus sessions

### Group Management

- **Start with 2-3 people** - Easier to find common time
- **Add members gradually** - More people = fewer available slots
- **Rotate facilitators** - Share responsibility for finding meeting times
- **Set a regular schedule** - Once you find good slots, repeat them weekly

---

## Troubleshooting

### "Waiting for N members to connect"

**Solution:** Ask those members to:
1. Go to **🤝 Companion Mode**
2. Scroll to **📅 Find Group Meeting Slots**
3. Click the blue **🔗 Connect** button next to their name
4. Complete Google Sign-In
5. Grant calendar access
6. You'll see "✅ Connected" once done

### "Can't find any common slots"

**Possible causes:**
- Members have very full schedules
- Different timezone issues
- Only looking at office hours (try evening slots)

**Solutions:**
- Expand search to 2+ weeks
- Suggest specific times manually with "+ Suggest Group Block"
- Check that all members' calendars are updated
- Try different times of day

### "Member accepted but slot not syncing"

**Solution:**
- Wait 30 seconds for sync
- Refresh the page
- Check "Group Focus Blocks" section
- Should show "✅ Added to Calendar" once all accept

### "Google Calendar button does nothing"

**Solution:**
- Check that you're signed in (should see "✅ Connected")
- Clear browser cache and refresh
- Try incognito/private window
- Check pop-up blockers aren't interfering

---

## Advanced Features

### Manual Block Suggestion

If "Find Best Slots" doesn't work well:

1. Click **+ Suggest Group Block**
2. Manually pick a time
3. Send to group for votes
4. Group members accept/decline

### Group Statistics

In **🏆 Weekly Leaderboard**:
- See who's contributing most focus time
- Compare group progress
- 7-day consistency challenges

### Auto-Suggest Feature

Click **🤖 Auto-Suggest (2-3)**:
- System looks at past focus session times
- Suggests blocks when everyone usually focuses
- Smart scheduling based on group patterns

---

## Support

**Need help?** Check:
- ✅ Are all members connected? (check "📱 Member Calendars")
- ✅ Do calendars have events? (need something to compare)
- ✅ Are there large enough gaps? (need 60+ minutes)
- ✅ Is timezone correct? (Google Calendar settings)

---

## Next Features Coming

- 📌 Calendar view for availability heatmaps
- 🤖 AI-suggested optimal times
- 🌍 Multi-timezone support
- 📱 Mobile notification reminders
- 🔄 Recurring group meeting scheduling
