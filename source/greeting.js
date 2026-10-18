/* Local greeting: the Windows launcher supplies the PC name in this file URL. */
const GREETING_KEY = 'folio-windows/profile';
const cleanGreetingName = (v) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
let greetingProfile = {};
try {
  const saved = JSON.parse(localStorage.getItem(GREETING_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) greetingProfile = saved;
} catch { /* private sessions can disable storage */ }
const greetingParams = new URLSearchParams(location.search);
const detectedPcName = cleanGreetingName(greetingParams.get('pc'));
const detectedAccountName = cleanGreetingName(greetingParams.get('user'));
if (detectedPcName) greetingProfile.pcName = detectedPcName;
if (detectedAccountName) greetingProfile.accountName = detectedAccountName;
function saveGreetingProfile() {
  try { localStorage.setItem(GREETING_KEY, JSON.stringify(greetingProfile)); } catch { /* session-only name */ }
}
if (detectedPcName || detectedAccountName) saveGreetingProfile();
function greetingName() {
  return cleanGreetingName(greetingProfile.displayName) || cleanGreetingName(greetingProfile.pcName) || cleanGreetingName(greetingProfile.accountName);
}
function greeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = greetingName();
  return name ? `${part}, ${name}.` : `${part}.`;
}
function refreshGreeting() {
  const title = $('#home-greeting');
  if (title) title.textContent = greeting();
}
function personalizeGreeting() {
  const input = h('input', { id: 'greeting-name', type: 'text', class: 'text full', maxlength: '80', autocomplete: 'off', 'aria-label': 'Display name', value: cleanGreetingName(greetingProfile.displayName) });
  const detected = cleanGreetingName(greetingProfile.pcName) || cleanGreetingName(greetingProfile.accountName);
  input.placeholder = detected || 'Enter your name';
  openModal({
    title: 'Personalize your greeting',
    body: h('div', null,
      h('p', null, detected ? `Detected on this PC: ${detected}. Leave the name blank to use it.` : 'Open Start-Folio.cmd to detect the Windows PC name, or enter a name below.'),
      h('label', { class: 'greeting-label', for: 'greeting-name' }, 'Display name'), input,
      h('p', { class: 'hint' }, 'Your name stays in this browser. The greeting follows this computer’s local time.')),
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Save name', primary: true, run: () => {
        greetingProfile.displayName = cleanGreetingName(input.value);
        saveGreetingProfile(); refreshGreeting();
      } },
    ],
  });
}
setInterval(refreshGreeting, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshGreeting(); });
