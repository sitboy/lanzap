// 语言包:键值外置,加语言=加一个对象;界面元素用 data-i18n 标记
window.I18N = {
  zh: {
    app_title: '局域网传输助手',
    subtitle: '同一 WiFi，打开即传',
    room_peers: '本网设备',
    only_you: '当前网络里只有你，用其他设备打开同一网址即可互传',
    input_placeholder: '输入文字，或点 + 传文件',
    send: '发送',
    me: '我',
    all: '所有人',
    to_all: '发给所有人',
    click_download: '点击保存',
    receiving: '接收中…',
    sending: '发送中…',
    sent: '已送达',
    failed: '传输失败',
    peer_joined: '{name} 进入了本网',
    peer_left: '{name} 离开了',
    direct: '点对点直连 · 文件不经过服务器',
    rename: '改名',
    rename_prompt: '本设备的名字：',
    offline_note: '对方已离线，无法送达（本工具不经服务器中转）',
    history_note: '记录只保存在本设备浏览器里',
  },
  en: {
    app_title: 'LAN Transfer',
    subtitle: 'Same Wi-Fi, open & send',
    room_peers: 'Devices on this network',
    only_you: 'You are alone here. Open this URL on another device on the same Wi-Fi.',
    input_placeholder: 'Type a message, or tap + to send files',
    send: 'Send',
    me: 'Me',
    all: 'Everyone',
    to_all: 'Send to everyone',
    click_download: 'Save',
    receiving: 'Receiving…',
    sending: 'Sending…',
    sent: 'Delivered',
    failed: 'Transfer failed',
    peer_joined: '{name} joined',
    peer_left: '{name} left',
    direct: 'Peer-to-peer · files never touch the server',
    rename: 'Rename',
    rename_prompt: 'Name of this device:',
    offline_note: 'Peer is offline. No server relay in this tool.',
    history_note: 'History is stored only in this browser',
  },
};
window.LANG = (localStorage.lang || (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en');
if (localStorage.lang) window.LANG = localStorage.lang;
window.t = (k, vars) => {
  let s = (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
  if (vars) for (const [kk, v] of Object.entries(vars)) s = s.replace('{' + kk + '}', v);
  return s;
};
