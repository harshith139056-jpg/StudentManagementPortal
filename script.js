/* =====================================================================
   Student Management Portal - prototype
   Plain HTML + CSS + JavaScript. Data is kept in browser localStorage.
   The "Smart Insights" feature is rule-based (keywords and thresholds).
   It is NOT a trained machine-learning model.
   ===================================================================== */

const KEY = 'smp_data_v1';
const SESSION_KEY = 'smp_session_v1';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const SLOTS = ['09:00-10:00', '10:00-11:00', '11:15-12:15', '12:15-13:15', '14:00-15:00', '15:00-16:00'];
const EXAMS = ['Internal Test', 'Mid Semester', 'Assignment'];
const MIN_ATTENDANCE = 75;

let data = null;      // all portal data
let session = null;   // { role, id }
let currentPage = 'dashboard';

/* ---------------------------- helpers ---------------------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => dateStr(new Date());
function dateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 2500);
}
function save() { localStorage.setItem(KEY, JSON.stringify(data)); }

/* ------------------------- sample data --------------------------- */
function rng(seed) { // small deterministic random generator
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedData() {
  const students = [
    { id: 'ST001', name: 'Aarav Shah',    division: 'A', email: 'aarav.shah@example.edu',    phone: '9000000001' },
    { id: 'ST002', name: 'Diya Patel',    division: 'A', email: 'diya.patel@example.edu',    phone: '9000000002' },
    { id: 'ST003', name: 'Rohan Mehta',   division: 'A', email: 'rohan.mehta@example.edu',   phone: '9000000003' },
    { id: 'ST004', name: 'Isha Joshi',    division: 'A', email: 'isha.joshi@example.edu',    phone: '9000000004' },
    { id: 'ST005', name: 'Karan Desai',   division: 'B', email: 'karan.desai@example.edu',   phone: '9000000005' },
    { id: 'ST006', name: 'Meera Trivedi', division: 'B', email: 'meera.trivedi@example.edu', phone: '9000000006' },
    { id: 'ST007', name: 'Vivaan Rao',    division: 'B', email: 'vivaan.rao@example.edu',    phone: '9000000007' },
    { id: 'ST008', name: 'Ananya Nair',   division: 'B', email: 'ananya.nair@example.edu',   phone: '9000000008' }
  ];
  const faculty = [
    { id: 'F01', name: 'Prof. Neha Kulkarni', email: 'neha.k@example.edu' },
    { id: 'F02', name: 'Prof. Suresh Iyer',   email: 'suresh.i@example.edu' },
    { id: 'F03', name: 'Dr. Anil Rao',        email: 'anil.r@example.edu' },
    { id: 'F04', name: 'Prof. Pooja Nair',    email: 'pooja.n@example.edu' }
  ];
  const subjects = [
    { code: 'DSA',  name: 'Data Structures',            facultyId: 'F01' },
    { code: 'PY',   name: 'Python Programming',         facultyId: 'F02' },
    { code: 'DM',   name: 'Discrete Mathematics',       facultyId: 'F03' },
    { code: 'DBMS', name: 'Database Management',        facultyId: 'F04' },
    { code: 'PS',   name: 'Probability and Statistics', facultyId: 'F03' }
  ];

  // attendance: last 10 week-days, one session per subject per day
  const rand = rng(42);
  const presentChance = [0.96, 0.9, 0.6, 0.85, 0.7, 0.93, 0.8, 0.97];
  const attendance = [];
  const d = new Date();
  let found = 0;
  while (found < 10) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    found++;
    subjects.forEach((sub) => {
      const records = {};
      students.forEach((s, i) => { records[s.id] = rand() < presentChance[i]; });
      attendance.push({ date: dateStr(d), subject: sub.code, records });
    });
  }

  // marks: Internal Test and Mid Semester entered, Assignment left empty
  const marks = {};
  const ability = [78, 85, 48, 66, 58, 90, 72, 95];
  students.forEach((s, i) => {
    subjects.forEach((sub) => {
      ['Internal Test', 'Mid Semester'].forEach((ex) => {
        const v = Math.round(ability[i] + rand() * 24 - 12);
        marks[s.id + '|' + sub.code + '|' + ex] = Math.max(20, Math.min(100, v));
      });
    });
  });

  // timetable: room + subject for each day/slot
  const order = ['DSA', 'PY', 'DM', 'DBMS', 'PS', ''];
  const rooms = { DSA: 'Room 301', PY: 'Lab 2', DM: 'Room 302', DBMS: 'Lab 1', PS: 'Room 303' };
  const timetable = {};
  DAYS.forEach((day, di) => {
    SLOTS.forEach((slot, si) => {
      const code = order[(di + si) % order.length];
      if (code) timetable[day + '|' + si] = { subject: code, room: rooms[code] };
    });
  });

  return { students, faculty, subjects, attendance, marks, timetable };
}

function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    data = raw ? JSON.parse(raw) : null;
  } catch (e) { data = null; }
  if (!data || !data.students) { data = seedData(); save(); }
}

/* ------------------------- calculations --------------------------- */
const subjectByCode = (c) => data.subjects.find((s) => s.code === c);
const studentById = (id) => data.students.find((s) => s.id === id);
const facultyById = (id) => data.faculty.find((f) => f.id === id);

// attendance percentage for one student (optionally one subject); null if no classes
function attPct(sid, subCode) {
  let total = 0, present = 0;
  data.attendance.forEach((a) => {
    if (subCode && a.subject !== subCode) return;
    if (!(sid in a.records)) return;
    total++;
    if (a.records[sid]) present++;
  });
  return total ? Math.round((present / total) * 100) : null;
}
// average marks for one student (optionally one subject); null if none entered
function avgMarks(sid, subCode) {
  const vals = [];
  Object.keys(data.marks).forEach((k) => {
    const [s, sub] = k.split('|');
    if (s === sid && (!subCode || sub === subCode)) vals.push(data.marks[k]);
  });
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}
function grade(avg) {
  if (avg === null) return '-';
  if (avg >= 85) return 'A+';
  if (avg >= 75) return 'A';
  if (avg >= 65) return 'B';
  if (avg >= 55) return 'C';
  if (avg >= 40) return 'D';
  return 'F';
}
function mean(arr) {
  const v = arr.filter((x) => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
const pctClass = (p) => p === null ? '' : p < 65 ? 'pct-bad' : p < MIN_ATTENDANCE ? 'pct-warn' : 'pct-good';
const pctText = (p) => p === null ? '-' : p + '%';

// Rule-based risk check ("smart insight")
function riskOf(sid) {
  const att = attPct(sid), avg = avgMarks(sid);
  const reasons = [];
  let level = 'Low';
  if (att !== null && att < 65) { level = 'High'; reasons.push('attendance is only ' + att + '%'); }
  else if (att !== null && att < MIN_ATTENDANCE) { level = 'Medium'; reasons.push('attendance (' + att + '%) is below ' + MIN_ATTENDANCE + '%'); }
  if (avg !== null && avg < 40) { level = 'High'; reasons.push('average marks are ' + avg); }
  else if (avg !== null && avg < 50) { if (level === 'Low') level = 'Medium'; reasons.push('average marks (' + avg + ') are low'); }
  const weak = data.subjects.filter((s) => { const a = avgMarks(sid, s.code); return a !== null && a < 40; }).map((s) => s.name);
  if (weak.length) { level = 'High'; reasons.push('marks below 40 in ' + weak.join(', ')); }
  let tip = 'Keep up the good work.';
  if (level === 'Medium') tip = 'Improve attendance and revise weak topics before the next test.';
  if (level === 'High') tip = 'Meet the class mentor soon and make a catch-up plan.';
  return { level, reasons, tip, att, avg };
}
const riskBadge = (lvl) => '<span class="badge ' + (lvl === 'High' ? 'b-bad' : lvl === 'Medium' ? 'b-warn' : 'b-good') + '">' + lvl + '</span>';

/* --------------------------- session ------------------------------ */
const isAdmin = () => session.role === 'admin';
const isFaculty = () => session.role === 'faculty';
const isStudent = () => session.role === 'student';
const isStaff = () => !isStudent();
function mySubjects() {
  if (isAdmin()) return data.subjects;
  if (isFaculty()) return data.subjects.filter((s) => s.facultyId === session.id);
  return [];
}
function visibleStudents() { return isStudent() ? data.students.filter((s) => s.id === session.id) : data.students; }

function fillPersonList() {
  const role = $('roleSelect').value;
  const wrap = $('personWrap'), sel = $('personSelect');
  if (role === 'admin') { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const list = role === 'faculty' ? data.faculty : data.students;
  sel.innerHTML = list.map((p) => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
}
function login() {
  const role = $('roleSelect').value;
  session = { role, id: role === 'admin' ? 'admin' : $('personSelect').value };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  startApp();
}
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  session = null;
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
}
function userName() {
  if (isAdmin()) return 'Administrator';
  return (isFaculty() ? facultyById(session.id) : studentById(session.id)).name;
}

/* -------------------------- navigation ---------------------------- */
function navItems() {
  const items = [['dashboard', 'Dashboard'], ['students', isStudent() ? 'My Record' : 'Students'],
    ['attendance', 'Attendance'], ['marks', 'Marks'], ['timetable', 'Timetable'], ['insights', 'Smart Insights']];
  return items;
}
function startApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('userChip').textContent = userName() + ' (' + session.role + ')';
  $('resetBtn').classList.toggle('hidden', !isAdmin());
  $('nav').innerHTML = navItems().map(([k, label]) => '<button data-page="' + k + '">' + label + '</button>').join('');
  go('dashboard');
}
function go(page) {
  currentPage = page;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  const titles = {
    dashboard: ['Dashboard', 'Overview of students, attendance and marks'],
    students: [isStudent() ? 'My Record' : 'Student Records', isStudent() ? 'Your personal details' : 'Add, search, edit and remove student records'],
    attendance: ['Attendance', isStudent() ? 'Your attendance by subject' : 'Mark daily attendance and view summaries'],
    marks: ['Marks', isStudent() ? 'Your marks and grade' : 'Enter marks and view results'],
    timetable: ['Timetable', 'Weekly class schedule'],
    insights: ['Smart Insights', 'Rule-based alerts and a keyword assistant']
  };
  $('pageTitle').textContent = titles[page][0];
  $('pageSub').textContent = titles[page][1];
  ({ dashboard: viewDashboard, students: viewStudents, attendance: viewAttendance, marks: viewMarks, timetable: viewTimetable, insights: viewInsights })[page]();
}

/* --------------------------- dashboard ---------------------------- */
function todaysClasses() {
  const day = DAYS[new Date().getDay() - 1]; // Sunday(0) and Saturday(6) give undefined
  if (!day) return { day: null, list: [] };
  const list = [];
  SLOTS.forEach((slot, i) => {
    const c = data.timetable[day + '|' + i];
    if (!c) return;
    const sub = subjectByCode(c.subject);
    if (isFaculty() && sub.facultyId !== session.id) return;
    list.push({ slot, sub, room: c.room });
  });
  return { day, list };
}
function classesHtml() {
  const t = todaysClasses();
  if (!t.day) return '<p class="muted">No classes on weekends.</p>';
  if (!t.list.length) return '<p class="muted">No classes scheduled today.</p>';
  return t.list.map((c) => '<div class="item"><strong>' + c.slot + '</strong> &nbsp; ' + esc(c.sub.name) + ' <span class="muted">(' + esc(c.room) + ')</span></div>').join('');
}
function viewDashboard() {
  const v = $('view');
  if (isStudent()) {
    const me = studentById(session.id), r = riskOf(me.id);
    const rows = data.subjects.map((s) => '<tr><td>' + esc(s.name) + '</td><td class="num ' + pctClass(attPct(me.id, s.code)) + '">' + pctText(attPct(me.id, s.code)) + '</td><td class="num">' + (avgMarks(me.id, s.code) ?? '-') + '</td></tr>').join('');
    v.innerHTML =
      '<div class="grid g4">' +
      stat('Overall attendance', pctText(r.att)) + stat('Average marks', r.avg ?? '-') + stat('Grade', grade(r.avg)) + stat('Status', r.level + ' risk') + '</div>' +
      '<div class="grid g2 section"><div class="card"><h3>Subject summary</h3><div class="table-wrap"><table><tr><th>Subject</th><th class="num">Attendance</th><th class="num">Avg marks</th></tr>' + rows + '</table></div></div>' +
      '<div class="card"><h3>Today\'s classes</h3>' + classesHtml() + '<h3 style="margin-top:18px">Advice</h3><p>' + esc(r.tip) + (r.reasons.length ? ' <span class="muted">(' + esc(r.reasons.join('; ')) + ')</span>' : '') + '</p></div></div>';
    return;
  }
  const studs = data.students;
  const atts = studs.map((s) => attPct(s.id)), avgs = studs.map((s) => avgMarks(s.id));
  const risky = studs.map((s) => ({ s, r: riskOf(s.id) })).filter((x) => x.r.level !== 'Low');
  const subs = isFaculty() ? mySubjects() : data.subjects;
  const bars = subs.map((sub) => {
    const p = mean(studs.map((s) => attPct(s.id, sub.code)));
    return '<div class="bar-row"><div class="name">' + esc(sub.name) + '</div><div class="bar"><span class="' + (p !== null && p < MIN_ATTENDANCE ? 'low' : '') + '" style="width:' + (p || 0) + '%"></span></div><div>' + pctText(p) + '</div></div>';
  }).join('') || '<p class="muted">No subjects assigned.</p>';
  v.innerHTML =
    '<div class="grid g4">' + stat('Total students', studs.length) + stat('Average attendance', pctText(mean(atts) === null ? null : Math.round(mean(atts)))) +
    stat('Average marks', mean(avgs) ?? '-') + stat('Students at risk', risky.length) + '</div>' +
    '<div class="grid g2 section"><div class="card"><h3>Attendance by subject</h3><p class="muted small">Red bar = below ' + MIN_ATTENDANCE + '%</p>' + bars + '</div>' +
    '<div class="card"><h3>Today\'s classes</h3>' + classesHtml() + '</div></div>' +
    '<div class="card section"><h3>Students needing attention</h3>' +
    (risky.length ? risky.map((x) => '<div class="item">' + riskBadge(x.r.level) + ' <strong>' + esc(x.s.name) + '</strong> <span class="muted">- ' + esc(x.r.reasons.join('; ')) + '</span></div>').join('') : '<p class="muted">No students are currently flagged.</p>') + '</div>';
}
function stat(label, value) { return '<div class="card stat"><div class="lbl">' + label + '</div><div class="num">' + value + '</div></div>'; }

/* ---------------------------- students ---------------------------- */
function viewStudents() {
  const v = $('view');
  if (isStudent()) {
    const s = studentById(session.id);
    v.innerHTML = '<div class="card"><h3>' + esc(s.name) + '</h3><p class="muted">Student ID: ' + esc(s.id) + '</p>' +
      '<p>Division: ' + esc(s.division) + '<br>Email: ' + esc(s.email) + '<br>Phone: ' + esc(s.phone) + '</p>' +
      '<p class="muted small">To change these details, please contact the administrator.</p></div>';
    return;
  }
  v.innerHTML = '<div class="card"><div class="row"><div style="flex:3"><label for="q">Search by name, ID or division</label><input type="search" id="q" placeholder="Type to search..."></div>' +
    (isAdmin() ? '<div style="flex:0 0 auto"><button class="btn primary" id="addStudent">+ Add student</button></div>' : '') +
    '</div><div class="table-wrap section" id="studentTable"></div></div>';
  $('q').addEventListener('input', drawStudentTable);
  if (isAdmin()) $('addStudent').addEventListener('click', () => studentDialog());
  drawStudentTable();
}
function drawStudentTable() {
  const q = $('q').value.trim().toLowerCase();
  const list = data.students.filter((s) => (s.name + ' ' + s.id + ' ' + s.division).toLowerCase().includes(q));
  const rows = list.map((s) => '<tr><td>' + esc(s.id) + '</td><td>' + esc(s.name) + '</td><td class="num">' + esc(s.division) + '</td><td>' + esc(s.email) + '</td><td>' + esc(s.phone) + '</td>' +
    '<td class="num ' + pctClass(attPct(s.id)) + '">' + pctText(attPct(s.id)) + '</td><td class="num">' + (avgMarks(s.id) ?? '-') + '</td>' +
    (isAdmin() ? '<td><button class="btn small" data-edit="' + s.id + '">Edit</button> <button class="btn small danger" data-del="' + s.id + '">Delete</button></td>' : '') + '</tr>').join('');
  $('studentTable').innerHTML = list.length ?
    '<table><tr><th>ID</th><th>Name</th><th class="num">Div</th><th>Email</th><th>Phone</th><th class="num">Attendance</th><th class="num">Avg marks</th>' + (isAdmin() ? '<th>Actions</th>' : '') + '</tr>' + rows + '</table>' :
    '<p class="muted">No students found.</p>';
  document.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => studentDialog(b.dataset.edit)));
  document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteStudent(b.dataset.del)));
}
function studentDialog(id) {
  const s = id ? studentById(id) : { id: '', name: '', division: 'A', email: '', phone: '' };
  const f = $('dialogForm');
  f.innerHTML = '<h3>' + (id ? 'Edit student' : 'Add student') + '</h3>' +
    '<div class="field"><label for="f_id">Student ID *</label><input type="text" id="f_id" value="' + esc(s.id) + '"' + (id ? ' readonly' : '') + '></div>' +
    '<div class="field"><label for="f_name">Full name *</label><input type="text" id="f_name" value="' + esc(s.name) + '"></div>' +
    '<div class="field"><label for="f_div">Division</label><select id="f_div">' + ['A', 'B', 'C'].map((d) => '<option' + (d === s.division ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="f_email">Email *</label><input type="email" id="f_email" value="' + esc(s.email) + '"></div>' +
    '<div class="field"><label for="f_phone">Phone</label><input type="text" id="f_phone" value="' + esc(s.phone) + '"></div>' +
    '<div class="error" id="f_err"></div>' +
    '<div class="dialog-actions"><button type="button" class="btn" id="f_cancel">Cancel</button><button type="button" class="btn primary" id="f_save">Save</button></div>';
  $('dialog').showModal();
  $('f_cancel').onclick = () => $('dialog').close();
  $('f_save').onclick = () => {
    const nid = $('f_id').value.trim(), name = $('f_name').value.trim(), email = $('f_email').value.trim();
    const err = $('f_err');
    if (!nid || !name || !email) { err.textContent = 'Please fill all fields marked with *.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Please enter a valid email address.'; return; }
    if (!id && studentById(nid)) { err.textContent = 'This Student ID already exists.'; return; }
    const rec = { id: nid, name, division: $('f_div').value, email, phone: $('f_phone').value.trim() };
    if (id) Object.assign(studentById(id), rec); else data.students.push(rec);
    save(); $('dialog').close(); toast(id ? 'Student updated' : 'Student added'); viewStudents();
  };
}
function deleteStudent(id) {
  const s = studentById(id);
  if (!confirm('Delete ' + s.name + '? Their attendance and marks will also be removed.')) return;
  data.students = data.students.filter((x) => x.id !== id);
  data.attendance.forEach((a) => delete a.records[id]);
  Object.keys(data.marks).forEach((k) => { if (k.startsWith(id + '|')) delete data.marks[k]; });
  save(); toast('Student deleted'); viewStudents();
}

/* --------------------------- attendance --------------------------- */
function viewAttendance() {
  const v = $('view');
  let html = '';
  if (isStaff()) {
    const subs = mySubjects();
    if (!subs.length) html += '<div class="card"><p class="muted">No subjects are assigned to you.</p></div>';
    else html += '<div class="card"><h3>Mark attendance</h3><div class="row section"><div><label for="a_sub">Subject</label><select id="a_sub">' +
      subs.map((s) => '<option value="' + s.code + '">' + esc(s.name) + '</option>').join('') + '</select></div>' +
      '<div><label for="a_date">Date</label><input type="date" id="a_date" value="' + todayStr() + '" max="' + todayStr() + '"></div></div>' +
      '<div id="a_list" class="att-list section"></div><div class="error" id="a_err"></div>' +
      '<div class="row"><div style="flex:0 0 auto"><button class="btn" id="a_all">Mark all present</button></div><div style="flex:0 0 auto"><button class="btn primary" id="a_save">Save attendance</button></div></div></div>';
  }
  html += '<div class="card section"><h3>Attendance summary</h3><p class="muted small">Minimum required: ' + MIN_ATTENDANCE + '%</p><div class="table-wrap">' + attendanceSummary() + '</div></div>';
  v.innerHTML = html;
  if (isStaff() && mySubjects().length) {
    $('a_sub').addEventListener('change', drawAttendanceList);
    $('a_date').addEventListener('change', drawAttendanceList);
    $('a_all').addEventListener('click', () => document.querySelectorAll('#a_list input.p').forEach((i) => { i.checked = true; }));
    $('a_save').addEventListener('click', saveAttendance);
    drawAttendanceList();
  }
}
function attendanceSummary() {
  const rows = visibleStudents().map((s) => '<tr><td>' + esc(s.name) + '</td>' +
    data.subjects.map((sub) => '<td class="num ' + pctClass(attPct(s.id, sub.code)) + '">' + pctText(attPct(s.id, sub.code)) + '</td>').join('') +
    '<td class="num ' + pctClass(attPct(s.id)) + '"><strong>' + pctText(attPct(s.id)) + '</strong></td></tr>').join('');
  return '<table><tr><th>Student</th>' + data.subjects.map((s) => '<th class="num">' + s.code + '</th>').join('') + '<th class="num">Overall</th></tr>' + rows + '</table>';
}
function drawAttendanceList() {
  const sub = $('a_sub').value, date = $('a_date').value;
  const existing = data.attendance.find((a) => a.subject === sub && a.date === date);
  $('a_list').innerHTML = (existing ? '<p class="muted small">Attendance already saved for this date. You can edit it.</p>' : '') +
    data.students.map((s) => {
      const present = existing ? existing.records[s.id] !== false : true;
      return '<label><span>' + esc(s.name) + ' <span class="muted small">' + esc(s.id) + '</span></span><span class="toggle">' +
        '<input type="radio" class="p" name="att_' + s.id + '" value="1"' + (present ? ' checked' : '') + '><span class="p">Present</span>' +
        '<input type="radio" class="a" name="att_' + s.id + '" value="0"' + (!present ? ' checked' : '') + '><span class="a">Absent</span></span></label>';
    }).join('');
  // make the visible span clickable by wrapping behaviour of <label>
  document.querySelectorAll('#a_list .toggle').forEach((t) => {
    t.querySelectorAll('span').forEach((sp) => sp.addEventListener('click', (e) => {
      const input = sp.previousElementSibling; if (input) { input.checked = true; e.preventDefault(); }
    }));
  });
}
function saveAttendance() {
  const sub = $('a_sub').value, date = $('a_date').value, err = $('a_err');
  err.textContent = '';
  if (!date) { err.textContent = 'Please select a date.'; return; }
  if (date > todayStr()) { err.textContent = 'Attendance cannot be marked for a future date.'; return; }
  const records = {};
  data.students.forEach((s) => {
    const sel = document.querySelector('input[name="att_' + s.id + '"]:checked');
    records[s.id] = sel ? sel.value === '1' : true;
  });
  const existing = data.attendance.find((a) => a.subject === sub && a.date === date);
  if (existing) existing.records = records; else data.attendance.push({ date, subject: sub, records });
  save(); toast('Attendance saved'); viewAttendance();
  $('a_sub').value = sub; $('a_date').value = date; drawAttendanceList();
}

/* ----------------------------- marks ------------------------------ */
function viewMarks() {
  const v = $('view');
  let html = '';
  if (isStaff()) {
    const subs = mySubjects();
    if (!subs.length) html += '<div class="card"><p class="muted">No subjects are assigned to you.</p></div>';
    else html += '<div class="card"><h3>Enter marks (out of 100)</h3><div class="row section"><div><label for="m_sub">Subject</label><select id="m_sub">' +
      subs.map((s) => '<option value="' + s.code + '">' + esc(s.name) + '</option>').join('') + '</select></div>' +
      '<div><label for="m_exam">Exam</label><select id="m_exam">' + EXAMS.map((e) => '<option>' + e + '</option>').join('') + '</select></div></div>' +
      '<div class="table-wrap section" id="m_table"></div><div class="error" id="m_err"></div><button class="btn primary" id="m_save">Save marks</button></div>';
  }
  html += '<div class="card section"><h3>Result summary</h3><p class="muted small">Average of all exams entered. Grade: A+ 85+, A 75+, B 65+, C 55+, D 40+, F below 40.</p><div class="table-wrap">' + resultSummary() + '</div></div>';
  v.innerHTML = html;
  if (isStaff() && mySubjects().length) {
    $('m_sub').addEventListener('change', drawMarksTable);
    $('m_exam').addEventListener('change', drawMarksTable);
    $('m_save').addEventListener('click', saveMarks);
    drawMarksTable();
  }
}
function resultSummary() {
  const rows = visibleStudents().map((s) => {
    const avg = avgMarks(s.id);
    return '<tr><td>' + esc(s.name) + '</td>' + data.subjects.map((sub) => '<td class="num">' + (avgMarks(s.id, sub.code) ?? '-') + '</td>').join('') +
      '<td class="num"><strong>' + (avg ?? '-') + '</strong></td><td class="num"><span class="badge ' + (avg === null ? 'b-grey' : avg < 40 ? 'b-bad' : avg < 55 ? 'b-warn' : 'b-good') + '">' + grade(avg) + '</span></td></tr>';
  }).join('');
  return '<table><tr><th>Student</th>' + data.subjects.map((s) => '<th class="num">' + s.code + '</th>').join('') + '<th class="num">Average</th><th class="num">Grade</th></tr>' + rows + '</table>';
}
function drawMarksTable() {
  const sub = $('m_sub').value, exam = $('m_exam').value;
  $('m_table').innerHTML = '<table><tr><th>Student</th><th>ID</th><th class="num">Marks</th></tr>' + data.students.map((s) => {
    const val = data.marks[s.id + '|' + sub + '|' + exam];
    return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.id) + '</td><td class="num"><input type="number" min="0" max="100" step="0.5" style="width:90px" data-sid="' + s.id + '" value="' + (val === undefined ? '' : val) + '"></td></tr>';
  }).join('') + '</table>';
}
function saveMarks() {
  const sub = $('m_sub').value, exam = $('m_exam').value, err = $('m_err');
  err.textContent = '';
  const inputs = [...document.querySelectorAll('#m_table input')];
  for (const i of inputs) {
    if (i.value === '') continue;
    const n = Number(i.value);
    if (isNaN(n) || n < 0 || n > 100) { err.textContent = 'Marks must be between 0 and 100.'; i.focus(); return; }
  }
  inputs.forEach((i) => {
    const k = i.dataset.sid + '|' + sub + '|' + exam;
    if (i.value === '') delete data.marks[k]; else data.marks[k] = Number(i.value);
  });
  save(); toast('Marks saved'); viewMarks();
  $('m_sub').value = sub; $('m_exam').value = exam; drawMarksTable();
}

/* --------------------------- timetable ---------------------------- */
function viewTimetable() {
  const todayName = DAYS[new Date().getDay() - 1];
  let h = '<div class="card"><div class="table-wrap"><table class="tt"><tr><th>Time</th>' + DAYS.map((d) => '<th class="num' + (d === todayName ? ' today' : '') + '">' + d + '</th>').join('') + '</tr>';
  SLOTS.forEach((slot, si) => {
    h += '<tr><th>' + slot + '</th>';
    DAYS.forEach((day) => {
      const c = data.timetable[day + '|' + si];
      let inner = '<span class="muted">-</span>';
      if (c) {
        const sub = subjectByCode(c.subject);
        const mine = isFaculty() && sub && sub.facultyId === session.id;
        inner = '<div class="subj">' + esc(sub ? sub.name : c.subject) + (mine ? ' &#9733;' : '') + '</div><div class="room">' + esc(c.room) + '</div>';
      }
      h += '<td class="cell' + (isAdmin() ? ' edit' : '') + (day === todayName ? ' today' : '') + '" data-day="' + day + '" data-slot="' + si + '">' + inner + '</td>';
    });
    h += '</tr>';
  });
  h += '</table></div><p class="muted small">' + (isAdmin() ? 'Click a cell to edit or clear it. ' : '') + (isFaculty() ? '&#9733; marks your own classes. ' : '') + 'Today\'s column is highlighted.</p></div>';
  $('view').innerHTML = h;
  if (isAdmin()) document.querySelectorAll('td.cell').forEach((td) => td.addEventListener('click', () => slotDialog(td.dataset.day, Number(td.dataset.slot))));
}
function slotDialog(day, si) {
  const key = day + '|' + si, cur = data.timetable[key] || { subject: '', room: '' };
  $('dialogForm').innerHTML = '<h3>' + day + ', ' + SLOTS[si] + '</h3>' +
    '<div class="field"><label for="t_sub">Subject</label><select id="t_sub"><option value="">- Free period -</option>' +
    data.subjects.map((s) => '<option value="' + s.code + '"' + (s.code === cur.subject ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="t_room">Room</label><input type="text" id="t_room" value="' + esc(cur.room) + '"></div>' +
    '<div class="dialog-actions"><button type="button" class="btn" id="t_cancel">Cancel</button><button type="button" class="btn primary" id="t_save">Save</button></div>';
  $('dialog').showModal();
  $('t_cancel').onclick = () => $('dialog').close();
  $('t_save').onclick = () => {
    const sub = $('t_sub').value;
    if (!sub) delete data.timetable[key]; else data.timetable[key] = { subject: sub, room: $('t_room').value.trim() || 'TBA' };
    save(); $('dialog').close(); toast('Timetable updated'); viewTimetable();
  };
}

/* --------------------------- insights ----------------------------- */
function viewInsights() {
  const list = visibleStudents().map((s) => ({ s, r: riskOf(s.id) }));
  const order = { High: 0, Medium: 1, Low: 2 };
  list.sort((a, b) => order[a.r.level] - order[b.r.level]);
  $('view').innerHTML =
    '<div class="grid g2"><div class="card"><h3>Risk alerts</h3><p class="muted small">Rules: attendance below ' + MIN_ATTENDANCE + '% or average marks below 50 gives a warning. This is a simple rule-based check, not a trained ML model.</p>' +
    list.map((x) => '<div class="item">' + riskBadge(x.r.level) + ' <strong>' + esc(x.s.name) + '</strong><br><span class="muted small">Attendance ' + pctText(x.r.att) + ' | Average marks ' + (x.r.avg ?? '-') + '</span><br><span class="small">' + esc(x.r.reasons.length ? 'Reason: ' + x.r.reasons.join('; ') + '. ' : '') + esc(x.r.tip) + '</span></div>').join('') + '</div>' +
    '<div class="card"><h3>Ask the portal</h3><p class="muted small">Keyword-based assistant. Try one of the examples.</p><div class="chips" id="chips"></div>' +
    '<div class="chat-log" id="chatLog"><div class="msg bot">Hello! Ask me about attendance, marks, risk or today\'s classes.</div></div>' +
    '<div class="row"><div style="flex:3"><input type="text" id="chatIn" placeholder="Type a question..." aria-label="Question"></div><div style="flex:0 0 auto"><button class="btn primary" id="chatSend">Ask</button></div></div></div></div>';
  const examples = isStudent() ? ['My attendance', 'My marks', 'Am I at risk?', 'Classes today'] : ['Low attendance students', 'Who is the topper?', 'Students at risk', 'Class average', 'Attendance of Rohan', 'Classes today'];
  $('chips').innerHTML = examples.map((e) => '<span class="chip">' + e + '</span>').join('');
  document.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => ask(c.textContent)));
  $('chatSend').addEventListener('click', () => ask($('chatIn').value));
  $('chatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('chatIn').value); });
}
function ask(q) {
  q = q.trim(); if (!q) return;
  const log = $('chatLog');
  log.innerHTML += '<div class="msg me">' + esc(q) + '</div><div class="msg bot">' + esc(answer(q)) + '</div>';
  log.scrollTop = log.scrollHeight;
  $('chatIn').value = '';
}
function answer(q) {
  const t = q.toLowerCase();
  const pool = visibleStudents();
  const named = pool.find((s) => t.includes(s.name.toLowerCase()) || t.includes(s.name.split(' ')[0].toLowerCase()));
  const who = isStudent() ? studentById(session.id) : named;
  const mentionsOther = isStudent() && data.students.some((s) => s.id !== session.id && (t.includes(s.name.toLowerCase()) || t.includes(s.name.split(' ')[0].toLowerCase())));
  if (mentionsOther) return 'Sorry, you can only view your own details.';

  if (/class(es)? today|today|schedule|timetable/.test(t)) {
    const c = todaysClasses();
    if (!c.day) return 'There are no classes on weekends.';
    return c.list.length ? 'Classes today (' + c.day + '):\n' + c.list.map((x) => x.slot + ' - ' + x.sub.name + ' (' + x.room + ')').join('\n') : 'No classes scheduled today.';
  }
  if (/topper|highest|top student|best/.test(t)) {
    if (isStudent()) return 'Class rankings are visible only to staff.';
    const best = data.students.map((s) => ({ s, a: avgMarks(s.id) })).filter((x) => x.a !== null).sort((a, b) => b.a - a.a)[0];
    return best ? best.s.name + ' has the highest average marks (' + best.a + ').' : 'No marks have been entered yet.';
  }
  if (/class average|average of (the )?class|overall average/.test(t)) {
    if (isStudent()) return 'Class averages are visible only to staff.';
    return 'The class average marks are ' + (mean(data.students.map((s) => avgMarks(s.id))) ?? '-') + ' and the average attendance is ' + pctText(Math.round(mean(data.students.map((s) => attPct(s.id))))) + '.';
  }
  if (/low attendance|shortage|below 75|attendance shortage/.test(t) && !isStudent()) {
    const low = data.students.filter((s) => { const a = attPct(s.id); return a !== null && a < MIN_ATTENDANCE; });
    return low.length ? 'Students below ' + MIN_ATTENDANCE + '% attendance:\n' + low.map((s) => s.name + ' (' + attPct(s.id) + '%)').join('\n') : 'No student is below ' + MIN_ATTENDANCE + '% attendance.';
  }
  if (/risk|weak|failing|struggling/.test(t)) {
    if (who) { const r = riskOf(who.id); return who.name + ' is ' + r.level + ' risk. ' + (r.reasons.length ? 'Reason: ' + r.reasons.join('; ') + '. ' : '') + r.tip; }
    const risky = data.students.filter((s) => riskOf(s.id).level !== 'Low');
    return risky.length ? 'Students at risk:\n' + risky.map((s) => s.name + ' - ' + riskOf(s.id).level).join('\n') : 'No students are flagged.';
  }
  if (/attendance/.test(t)) {
    if (who) return who.name + ' has ' + pctText(attPct(who.id)) + ' overall attendance.\n' + data.subjects.map((s) => s.name + ': ' + pctText(attPct(who.id, s.code))).join('\n');
    return 'Please mention a student name, for example "Attendance of Rohan".';
  }
  if (/marks|score|grade|result/.test(t)) {
    if (who) return who.name + ' has average marks ' + (avgMarks(who.id) ?? '-') + ' (grade ' + grade(avgMarks(who.id)) + ').\n' + data.subjects.map((s) => s.name + ': ' + (avgMarks(who.id, s.code) ?? '-')).join('\n');
    return 'Please mention a student name, for example "Marks of Diya".';
  }
  return 'I did not understand that. Try: "Low attendance students", "Who is the topper?", "Attendance of Rohan" or "Classes today".';
}

/* ------------------------------ start ------------------------------ */
function init() {
  loadData();
  $('roleSelect').addEventListener('change', fillPersonList);
  $('loginBtn').addEventListener('click', login);
  $('logoutBtn').addEventListener('click', logout);
  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset all data to the sample data?')) return;
    data = seedData(); save(); toast('Demo data reset'); go(currentPage);
  });
  $('nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.page); });
  fillPersonList();
  try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }
  if (session && (session.role === 'admin' || (session.role === 'faculty' && facultyById(session.id)) || (session.role === 'student' && studentById(session.id)))) startApp();
}
init();
