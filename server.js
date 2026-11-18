// CPRS - Campus Problem Reporting System
// A small Node.js server with no outside packages. Run: node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA, "db.json");

const STATUSES = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High"];
const ROLE_NAMES = { student: "Student", admin: "Department admin", staff: "Maintenance staff", sysadmin: "System admin" };
const CAT_DEPT = { "Electrical": "Electrical", "Water leakage": "Plumbing", "Wi-Fi": "IT Support", "Furniture": "Carpentry", "Cleanliness": "Housekeeping", "Hostel": "Hostel Office" };

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------- passwords and ids ---------- */
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString("hex");
function makeUser(name, email, pw, role, dept) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { id: crypto.randomUUID(), name, email: email.toLowerCase(), salt, hash: hashPw(pw, salt), role, dept, prefs: { status: true, comments: true, digest: false }, theme: "auto" };
}
const checkPw = (u, pw) => {
  const a = Buffer.from(hashPw(pw, u.salt), "hex"), b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/* ---------- the database: one JSON file, saved after every change ---------- */
let db;
function seed() {
  const U = (n, e, r, d) => makeUser(n, e, "password", r, d);
  const users = [
    U("Ananya Verma", "ananya.verma@college.edu", "student", "Computer Science and Engineering"),
    U("Rohan Mehta", "rohan.mehta@college.edu", "student", "Electronics and Communication"),
    U("Simran Kaur", "simran.kaur@college.edu", "student", "Computer Science and Engineering"),
    U("Karan Gill", "karan.gill@college.edu", "student", "Mechanical Engineering"),
    U("Dept. Admin", "admin.estate@college.edu", "admin", "Estate Office"),
    U("Harpreet Singh", "harpreet.singh@college.edu", "staff", "Electrical"),
    U("Manoj Kumar", "manoj.kumar@college.edu", "staff", "Plumbing"),
    U("Neha Kaur", "neha.kaur@college.edu", "staff", "IT Support"),
    U("Sukhdev Singh", "sukhdev.singh@college.edu", "staff", "Carpentry"),
    U("Ramesh Lal", "ramesh.lal@college.edu", "staff", "Housekeeping"),
    U("System Admin", "sysadmin@college.edu", "sysadmin", "IT Services"),
  ];
  const id = n => users.find(u => u.name === n).id;
  const ago = m => Date.now() - m * 60000;
  let n = 1000;
  const mk = o => {
    const history = o.h.map(([status, by, m]) => ({ status, by, ts: ago(m) }));
    return { id: "#" + (++n), title: o.title, category: o.category, loc: o.loc, desc: o.desc, priority: o.priority, status: o.status, ownerId: id(o.owner), anonymous: !!o.anonymous, photo: null,
      voters: [], seedVotes: o.votes || 0, comments: o.comments || [], assigneeId: o.assignee ? id(o.assignee) : null, rating: o.rating || null, history, created: history[0].ts };
  };
  const complaints = [
    mk({ title: "Ceiling fan not working", category: "Electrical", loc: "Block A · Floor 2 · Room 204", desc: "Both fans at the back of the room stopped working. The room gets very hot in the afternoon.", priority: "High", status: "In Progress", owner: "Ananya Verma", assignee: "Harpreet Singh", votes: 14, h: [["Submitted", "Ananya Verma", 2880], ["Under Review", "Dept. Admin", 2700], ["Assigned", "Dept. Admin", 2600], ["In Progress", "Harpreet Singh", 300]], comments: [{ by: "Dept. Admin", text: "Assigned to the electrical team.", ts: ago(2600) }] }),
    mk({ title: "Water leakage in washroom", category: "Water leakage", loc: "Hostel 3 · Ground floor · Washroom", desc: "The tap near the last cubicle drips all day and the floor stays wet.", priority: "Medium", status: "Assigned", owner: "Ananya Verma", assignee: "Manoj Kumar", votes: 6, h: [["Submitted", "Ananya Verma", 1500], ["Under Review", "Dept. Admin", 1400], ["Assigned", "Dept. Admin", 1380]] }),
    mk({ title: "Wi-Fi not working", category: "Wi-Fi", loc: "Main Library · 1st floor", desc: "The connection drops every few minutes, so online sessions keep breaking.", priority: "High", status: "Resolved", owner: "Ananya Verma", assignee: "Neha Kaur", votes: 22, h: [["Submitted", "Ananya Verma", 4300], ["Under Review", "Dept. Admin", 4200], ["Assigned", "Dept. Admin", 4190], ["In Progress", "Neha Kaur", 3000], ["Resolved", "Neha Kaur", 1200]] }),
    mk({ title: "Broken chair", category: "Furniture", loc: "CSE Department · Lab 5", desc: "Two chairs have a broken back rest and are unsafe to sit on.", priority: "Low", status: "Closed", owner: "Ananya Verma", assignee: "Sukhdev Singh", votes: 3, rating: 4, h: [["Submitted", "Ananya Verma", 9000], ["Under Review", "Dept. Admin", 8900], ["Assigned", "Dept. Admin", 8800], ["In Progress", "Sukhdev Singh", 8000], ["Resolved", "Sukhdev Singh", 7000], ["Closed", "Ananya Verma", 6900]] }),
    mk({ title: "Dustbins overflowing", category: "Cleanliness", loc: "Cafeteria · Entrance", desc: "The bins near the entrance have not been emptied for two days.", priority: "Medium", status: "Under Review", owner: "Rohan Mehta", votes: 9, h: [["Submitted", "Rohan Mehta", 700], ["Under Review", "Dept. Admin", 600]] }),
    mk({ title: "Projector not turning on", category: "Electrical", loc: "Lecture Hall Complex · LT-5", desc: "The projector gives no signal even after changing the cable. Classes are being affected.", priority: "High", status: "Submitted", owner: "Simran Kaur", votes: 11, h: [["Submitted", "Simran Kaur", 120]] }),
    mk({ title: "Light flickering in corridor", category: "Electrical", loc: "Hostel 5 · 2nd floor corridor", desc: "The tube light flickers all night and disturbs sleep.", priority: "Low", status: "Closed", owner: "Karan Gill", assignee: "Harpreet Singh", votes: 4, rating: 5, h: [["Submitted", "Karan Gill", 11000], ["Under Review", "Dept. Admin", 10900], ["Assigned", "Dept. Admin", 10800], ["In Progress", "Harpreet Singh", 10000], ["Resolved", "Harpreet Singh", 9000], ["Closed", "Karan Gill", 8900]] }),
    mk({ title: "Washroom door lock broken", category: "Hostel", loc: "Hostel 3 · 1st floor", desc: "The lock on the second washroom door does not work.", priority: "Medium", status: "Assigned", owner: "Rohan Mehta", assignee: "Sukhdev Singh", votes: 5, anonymous: true, h: [["Submitted", "Rohan Mehta", 1900], ["Under Review", "Dept. Admin", 1800], ["Assigned", "Dept. Admin", 1700]] }),
  ];
  const note = (to, text, m, read) => ({ id: crypto.randomUUID(), toId: id(to), text, ts: ago(m), read });
  const notifs = [
    note("Ananya Verma", "#1002: assigned to Manoj Kumar.", 1380, false),
    note("Ananya Verma", "#1003: marked resolved. Please check the fix and close it.", 1200, false),
    note("Ananya Verma", "#1001: work has started.", 300, true),
    note("Dept. Admin", "#1006: new complaint, High priority.", 120, false),
    note("Harpreet Singh", "#1001 is assigned to you.", 2600, true),
  ];
  return { seq: n, users, complaints, notifs, sessions: {},
    cats: ["Electrical", "Water leakage", "Wi-Fi", "Furniture", "Cleanliness", "Hostel"],
    depts: ["Electrical", "Plumbing", "IT Support", "Carpentry", "Housekeeping", "Hostel Office"] };
}
function load() {
  if (process.argv.includes("--reset")) { try { fs.unlinkSync(DB_FILE); } catch (e) {} console.log("Sample data restored."); }
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) { const d = seed(); fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 1)); return d; }
}
function save() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
db = load();

/* ---------- small helpers ---------- */
const userById = id => db.users.find(u => u.id === id);
const byRole = r => db.users.filter(u => u.role === r);
function notify(toId, text) { if (toId) db.notifs.unshift({ id: crypto.randomUUID(), toId, text, ts: Date.now(), read: false }); }
function notifyPref(toId, text, pref) { const u = userById(toId); if (u && u.prefs[pref] !== false) notify(toId, text); }
function setStatus(c, status, by, msg) {
  c.status = status; c.history.push({ status, by: by.name, ts: Date.now() });
  if (c.ownerId !== by.id) notifyPref(c.ownerId, c.id + ": " + msg, "status");
}
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

/* ---------- what each person is allowed to see ---------- */
function viewComplaint(c, me) {
  const priv = me.role === "admin" || me.role === "sysadmin";
  const owner = userById(c.ownerId), asg = c.assigneeId ? userById(c.assigneeId) : null;
  const hide = c.anonymous && !priv && c.ownerId !== me.id;
  return {
    id: c.id, title: c.title, category: c.category, loc: c.loc, desc: c.desc, priority: c.priority, status: c.status,
    owner: hide ? "Anonymous" : (owner ? owner.name : "Former user"), anonymous: c.anonymous,
    mine: c.ownerId === me.id, mineAssigned: c.assigneeId === me.id,
    assignee: asg ? asg.name : null, photo: c.photo, rating: c.rating, created: c.created,
    votes: c.seedVotes + c.voters.length, voted: c.voters.includes(me.id),
    comments: c.comments.map(m => ({ by: m.by, text: m.text, ts: m.ts })),
    history: c.history.map((h, i) => (i === 0 && hide ? { ...h, by: "Anonymous" } : h)),
  };
}
function stateFor(me) {
  return {
    me: { id: me.id, name: me.name, email: me.email, role: me.role, roleLabel: ROLE_NAMES[me.role], dept: me.dept, prefs: me.prefs, theme: me.theme },
    complaints: db.complaints.map(c => viewComplaint(c, me)),
    notifs: db.notifs.filter(n => n.toId === me.id).map(n => ({ id: n.id, text: n.text, ts: n.ts, read: n.read })),
    users: me.role === "sysadmin" ? db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: ROLE_NAMES[u.role], dept: u.dept })) : [],
    staff: byRole("staff").map(u => ({ id: u.id, name: u.name, dept: u.dept })),
    cats: db.cats, depts: db.depts, catDept: CAT_DEPT,
  };
}

/* ---------- sessions (stored in memory, 7 days) ---------- */
const sessions = new Map();
const COOKIE = "cprs_session";
function cookieOf(req) {
  const m = (req.headers.cookie || "").split(/;\s*/).find(x => x.startsWith(COOKIE + "="));
  return m ? m.slice(COOKIE.length + 1) : null;
}
function userOf(req) {
  const t = cookieOf(req), s = t && sessions.get(t);
  if (!s || s.exp < Date.now()) { if (t) sessions.delete(t); return null; }
  return userById(s.uid) || null;
}
function startSession(res, user) {
  const t = crypto.randomBytes(32).toString("hex");
  sessions.set(t, { uid: user.id, exp: Date.now() + 7 * 864e5 });
  res.setHeader("Set-Cookie", `${COOKIE}=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}`);
}
const tries = new Map();
function tooMany(key) {
  const now = Date.now(), a = (tries.get(key) || []).filter(t => now - t < 600000);
  tries.set(key, a); return a.length >= 10;
}

/* ---------- request helpers ---------- */
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new HttpError(code, msg); };
function send(res, code, obj, type) {
  const body = type ? obj : JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}
function readBody(req, limit = 6e6) {
  return new Promise((ok, no) => {
    let n = 0; const parts = [];
    req.on("data", c => { n += c.length; if (n > limit) { no(new HttpError(413, "That upload is too large.")); req.destroy(); } else parts.push(c); });
    req.on("end", () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString("utf8")) : {}); } catch (e) { no(new HttpError(400, "Bad request.")); } });
    req.on("error", no);
  });
}
const need = me => { if (!me) fail(401, "Please sign in."); return me; };
const allow = (me, ...roles) => { if (!roles.includes(me.role)) fail(403, "You are not allowed to do that."); };
const emailOk = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

function savePhoto(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3e6) fail(413, "The photo is too large. Please use a smaller one.");
  const name = crypto.randomBytes(12).toString("hex") + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  return "/uploads/" + name;
}

/* ---------- the API ---------- */
async function api(req, res, url) {
  const method = req.method, p = url.pathname;
  if (method !== "GET" && !/^application\/json/i.test(req.headers["content-type"] || "")) fail(415, "Bad request.");
  const me = userOf(req);

  if (method === "GET" && p === "/api/public") {
    return send(res, 200, { total: db.complaints.length, resolved: db.complaints.filter(c => ["Resolved", "Closed"].includes(c.status)).length });
  }
  if (method === "POST" && p === "/api/login") {
    const b = await readBody(req), email = clean(b.email, 200).toLowerCase(), key = req.socket.remoteAddress + "|" + email;
    if (tooMany(key)) fail(429, "Too many attempts. Wait a few minutes and try again.");
    const u = db.users.find(x => x.email === email);
    if (!u || !checkPw(u, String(b.password || ""))) { tries.get(key).push(Date.now()); fail(401, "Wrong email or password."); }
    startSession(res, u); return send(res, 200, { ok: true });
  }
  if (method === "POST" && p === "/api/register") {
    const b = await readBody(req), name = clean(b.name, 60), email = clean(b.email, 200).toLowerCase(), pw = String(b.password || "");
    if (name.length < 2) fail(400, "Enter your full name.");
    if (!emailOk(email)) fail(400, "Enter a valid email address.");
    if (pw.length < 6) fail(400, "The password must be at least 6 characters.");
    if (db.users.some(u => u.email === email)) fail(409, "An account with this email already exists.");
    const u = makeUser(name, email, pw, "student", clean(b.dept, 80) || "-");
    db.users.push(u); save(); startSession(res, u); return send(res, 200, { ok: true });
  }
  if (method === "POST" && p === "/api/logout") {
    const t = cookieOf(req); if (t) sessions.delete(t);
    res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return send(res, 200, { ok: true });
  }

  need(me);
  if (method === "GET" && p === "/api/state") return send(res, 200, stateFor(me));

  if (method === "GET" && p === "/api/export.csv") {
    allow(me, "admin", "sysadmin");
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const rows = [["ID", "Title", "Category", "Location", "Priority", "Status", "Reported by", "Assigned to", "Upvotes", "Rating", "Reported on"].map(q).join(",")];
    for (const c of db.complaints) { const v = viewComplaint(c, me); rows.push([v.id, v.title, v.category, v.loc, v.priority, v.status, v.owner, v.assignee, v.votes, v.rating, new Date(v.created).toISOString()].map(q).join(",")); }
    res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=cprs-complaints.csv" });
    return res.end("﻿" + rows.join("\r\n"));
  }

  if (method === "POST" && p === "/api/complaints") {
    allow(me, "student");
    const b = await readBody(req), title = clean(b.title, 80), loc = clean(b.loc, 120), desc = clean(b.desc, 1000);
    if (title.length < 5) fail(400, "Enter a short title of at least 5 characters.");
    if (loc.length < 3) fail(400, "Enter the location, for example Block A · Floor 2 · Room 204.");
    if (desc.length < 5) fail(400, "Add a few words of detail so staff know what to fix.");
    if (!db.cats.includes(b.category)) fail(400, "Choose a category.");
    if (!PRIORITIES.includes(b.priority)) fail(400, "Choose a priority.");
    const photo = b.photo ? savePhoto(b.photo) : null;
    const c = { id: "#" + (++db.seq), title, category: b.category, loc, desc, priority: b.priority, status: "Submitted", ownerId: me.id, anonymous: !!b.anon, photo,
      voters: [], seedVotes: 0, comments: [], assigneeId: null, rating: null, history: [{ status: "Submitted", by: me.name, ts: Date.now() }], created: Date.now() };
    db.complaints.unshift(c);
    notify(me.id, c.id + ": received. We will review it soon.");
    byRole("admin").forEach(a => notify(a.id, c.id + ": new complaint, " + c.priority + " priority."));
    save(); return send(res, 200, { id: c.id });
  }

  let m = /^\/api\/complaints\/(\d+)\/(\w+)$/.exec(p);
  if (method === "POST" && m) {
    const c = db.complaints.find(x => x.id === "#" + m[1]); if (!c) fail(404, "Complaint not found.");
    const b = await readBody(req), act = m[2], mine = c.ownerId === me.id;
    const admins = () => byRole("admin");
    const stat = (s) => c.status === s || fail(409, "That is not possible at this stage.");
    switch (act) {
      case "vote": { const i = c.voters.indexOf(me.id); if (i >= 0) c.voters.splice(i, 1); else c.voters.push(me.id); break; }
      case "comment": {
        const t = clean(b.text, 500); if (!t) fail(400, "Write a comment first.");
        c.comments.push({ by: me.name, byId: me.id, text: t, ts: Date.now() });
        if (!mine) notifyPref(c.ownerId, c.id + ": new comment from " + me.name + ".", "comments");
        break;
      }
      case "review": allow(me, "admin"); stat("Submitted"); setStatus(c, "Under Review", me, "is now under review."); break;
      case "dup": allow(me, "admin"); if (!["Submitted", "Under Review"].includes(c.status)) fail(409, "That is not possible at this stage.");
        setStatus(c, "Closed", me, "closed as a duplicate of an existing complaint.");
        c.comments.push({ by: me.name, byId: me.id, text: "Closed as a duplicate of an existing complaint.", ts: Date.now() }); break;
      case "assign": {
        allow(me, "admin"); stat("Under Review");
        const s = userById(b.staffId); if (!s || s.role !== "staff") fail(400, "Choose a staff member.");
        if (!PRIORITIES.includes(b.priority)) fail(400, "Choose a priority.");
        c.assigneeId = s.id; c.priority = b.priority;
        setStatus(c, "Assigned", me, "assigned to " + s.name + "."); notify(s.id, c.id + " is assigned to you."); break;
      }
      case "start": allow(me, "staff"); if (c.assigneeId !== me.id) fail(403, "This complaint is not assigned to you."); stat("Assigned"); setStatus(c, "In Progress", me, "work has started."); break;
      case "resolve": allow(me, "staff"); if (c.assigneeId !== me.id) fail(403, "This complaint is not assigned to you."); stat("In Progress");
        setStatus(c, "Resolved", me, "marked resolved. Please check the fix and close it."); break;
      case "close": {
        if (!mine) fail(403, "Only the person who reported it can close it."); stat("Resolved");
        const r = +b.rating; c.rating = r >= 1 && r <= 5 ? Math.round(r) : null;
        setStatus(c, "Closed", me, "closed by the user.");
        notify(c.assigneeId, c.id + " was closed by the user" + (c.rating ? " with " + c.rating + " stars." : "."));
        break;
      }
      case "reopen": {
        if (!mine) fail(403, "Only the person who reported it can reopen it."); stat("Resolved");
        setStatus(c, "Under Review", me, "reopened and sent back for review.");
        c.comments.push({ by: me.name, byId: me.id, text: "The problem is still there.", ts: Date.now() });
        admins().forEach(a => notify(a.id, c.id + " was reopened by the user.")); break;
      }
      default: fail(404, "Unknown action.");
    }
    save(); return send(res, 200, { ok: true });
  }

  if (method === "POST" && p === "/api/notifications/read") {
    db.notifs.forEach(n => { if (n.toId === me.id) n.read = true; }); save(); return send(res, 200, { ok: true });
  }
  if (method === "POST" && p === "/api/settings") {
    const b = await readBody(req);
    if (["auto", "light", "dark"].includes(b.theme)) me.theme = b.theme;
    if (b.prefs && typeof b.prefs === "object") for (const k of ["status", "comments", "digest"]) if (typeof b.prefs[k] === "boolean") me.prefs[k] = b.prefs[k];
    save(); return send(res, 200, { ok: true });
  }
  if (method === "POST" && p === "/api/password") {
    const b = await readBody(req);
    if (!checkPw(me, String(b.current || ""))) fail(400, "The current password is wrong.");
    if (String(b.next || "").length < 6) fail(400, "The new password must be at least 6 characters.");
    me.salt = crypto.randomBytes(16).toString("hex"); me.hash = hashPw(String(b.next), me.salt);
    for (const [t, s] of sessions) if (s.uid === me.id && t !== cookieOf(req)) sessions.delete(t);
    save(); return send(res, 200, { ok: true });
  }

  /* system admin only */
  if (method === "POST" && p === "/api/users") {
    allow(me, "sysadmin");
    const b = await readBody(req), name = clean(b.name, 60), email = clean(b.email, 200).toLowerCase(), pw = String(b.password || "");
    const role = ({ student: "student", faculty: "student", admin: "admin", staff: "staff" })[String(b.role || "")];
    if (name.length < 2) fail(400, "Enter the full name.");
    if (!emailOk(email)) fail(400, "Enter a valid email address.");
    if (pw.length < 6) fail(400, "The password must be at least 6 characters.");
    if (!role) fail(400, "Choose a role.");
    if (db.users.some(u => u.email === email)) fail(409, "An account with this email already exists.");
    db.users.push(makeUser(name, email, pw, role, clean(b.dept, 80) || "-")); save(); return send(res, 200, { ok: true });
  }
  m = /^\/api\/users\/([\w-]+)\/delete$/.exec(p);
  if (method === "POST" && m) {
    allow(me, "sysadmin");
    const u = userById(m[1]); if (!u) fail(404, "User not found.");
    if (u.id === me.id) fail(400, "You cannot remove your own account.");
    if (u.role === "sysadmin" && byRole("sysadmin").length < 2) fail(400, "There must be at least one system admin.");
    db.users = db.users.filter(x => x.id !== u.id);
    for (const [t, s] of sessions) if (s.uid === u.id) sessions.delete(t);
    save(); return send(res, 200, { ok: true });
  }
  if (method === "POST" && (p === "/api/categories" || p === "/api/departments")) {
    allow(me, "sysadmin");
    const b = await readBody(req), n = clean(b.name, 40), list = p === "/api/categories" ? db.cats : db.depts;
    if (n.length < 2) fail(400, "Enter a name.");
    if (list.some(x => x.toLowerCase() === n.toLowerCase())) fail(409, "That name already exists.");
    list.push(n); save(); return send(res, 200, { ok: true });
  }
  fail(404, "Not found.");
}

/* ---------- static files ---------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function serveFile(res, dir, rel, me) {
  const file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(dir + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const h = { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" };
    if (dir === UPLOADS) h["Cache-Control"] = "private, max-age=3600";
    res.writeHead(200, h); res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/uploads/")) {
      if (!userOf(req)) return send(res, 401, "Sign in first", "text/plain");
      return serveFile(res, UPLOADS, decodeURIComponent(url.pathname.slice(9)));
    }
    if (req.method !== "GET") return send(res, 405, "Method not allowed", "text/plain");
    return serveFile(res, PUBLIC, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1)));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e); send(res, 500, { error: "Something went wrong on the server." });
  }
});

server.listen(PORT, HOST, () => {
  const os = require("os");
  const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("\n  CPRS is running.\n");
  console.log("  On this computer:  http://localhost:" + PORT);
  lan.forEach(a => console.log("  On your Wi-Fi:     http://" + a + ":" + PORT));
  console.log("\n  Demo password for every sample account: password");
  console.log("  Press Ctrl+C to stop.\n");
});
