/* ──────────────────────────────────────────────────────────────
   Simulated logs for the hero scene (FIG. 01).
   Each entry: [t, kind, text]
     t    — scene time in seconds (one scene second ≈ one minute)
     kind — '' normal · 'red' malicious · 'blue' defensive · 'dim' noise
   Addresses use documentation ranges (RFC 5737) and .example domains.
     attacker  192.168.1.23 → NAT 203.0.113.66 · C2 cdn-telemetry.example
     DMZ       web 172.16.10.10 · mail 172.16.10.25 · dns 172.16.10.53 (public 198.51.100.0/28)
     users     WS11 10.10.20.11 (m.rossi) · WS12 10.10.20.12 · WS13 10.10.20.13
     servers   DC01 10.10.30.10 · FS01 10.10.30.21 · APP01 10.10.30.22 · SIEM 10.10.99.10
   ────────────────────────────────────────────────────────────── */
window.SCENE_LOGS = {
  off: {
    title: 'A-00 Offensive Agent', src: 'agent trace · planner + tool calls',
    lines: [
      [0.0, 'dim', '[plan] objective: Domain Admin on corp.example · constraint: stay quiet'],
      [0.3, '', '[tool] nmap -sS -T2 198.51.100.0/28'],
      [0.6, '', '[obs]  25/smtp postfix · 53/dns bind · 80/http nginx (WAF in front)'],
      [0.9, '', '[think] web is hardened; the mail relay accepts external senders → phishing'],
      [1.4, '', "[tool] craft_lure(to='m.rossi', theme='invoice', payload='docm → ps stager')"],
      [3.8, 'red', '[tool] smtp_send(relay=mx.corp.example) → 250 OK queued as 4F2A1C0'],
      [5.0, 'red', '[event] beacon from WS11\\m.rossi via https://cdn-telemetry.example'],
      [6.2, 'red', '[tool] enum: net group "Domain Admins" · nltest /dclist:corp'],
      [6.5, '', '[think] WS13 has a helpdesk session cached → pivot there'],
      [7.0, 'red', '[tool] psexec \\\\WS13 -u CORP\\helpdesk (hash) → SYSTEM'],
      [7.6, 'red', '[tool] dcsync DC01 /user:krbtgt …'],
      [8.7, 'blue', '[error] C2 channel dropped · WS11 + WS13 unreachable'],
      [9.3, 'blue', '[error] DNS for cdn-telemetry.example → NXDOMAIN'],
      [9.6, 'dim', '[think] lateral path closed at F-02. retreat, preserve infra.'],
      [10.6, 'blue', '[status] operation contained · objectives 0/1'],
    ],
  },
  def: {
    title: 'B-00 Defensive Agent', src: 'agent trace · correlation + response',
    lines: [
      [0.0, 'dim', '[watch] baseline loaded · 14 hosts · Elastic Defend on endpoints'],
      [0.5, 'dim', '[signal] edge: SYN scan from 203.0.113.66 (blocked, low priority)'],
      [4.9, '', '[signal] WS11: Office spawned powershell (confidence 0.42)'],
      [5.1, '', '[signal] WS11: first-seen domain cdn-telemetry.example'],
      [6.2, '', '[signal] WS11: AD enumeration burst'],
      [7.1, '', '[signal] WS13: PSEXESVC installed by CORP\\helpdesk'],
      [7.5, 'red', '[correlate] phish → macro → C2 → lateral WS13 · confidence 0.91'],
      [8.0, 'red', '[alert] CRITICAL · DCSync attempt from WS13 against DC01'],
      [8.6, 'blue', '[act] isolate WS11, WS13 (Elastic Defend)'],
      [8.9, 'blue', '[act] disable CORP\\helpdesk · schedule krbtgt double reset'],
      [9.3, 'blue', '[act] block 203.0.113.66 + cdn-telemetry.example (F-01, RPZ)'],
      [9.8, 'blue', '[act] harden F-02: deny SMB/RPC/WinRM users → servers'],
      [10.6, 'blue', '[status] contained · case #2026-118 handed to SOC'],
    ],
  },
  host: {
    title: 'A-01 Attacker host', src: 'kali · ~/.zsh_history + c2 console',
    lines: [
      [0.2, '', '$ nmap -sS -T2 -p- 198.51.100.0/28 -oA recon'],
      [0.6, 'dim', '25/tcp open smtp · 53/tcp open domain · 80/tcp open http'],
      [1.5, '', '$ python3 lure.py --to m.rossi@corp.example --doc invoice_0938.docm'],
      [3.8, 'red', '$ swaks --server mx.corp.example --attach invoice_0938.docm'],
      [5.0, 'red', '[c2] new beacon  WS11\\m.rossi  10.10.20.11  pid 6412  https'],
      [7.0, 'red', '[c2] new beacon  WS13\\SYSTEM   10.10.20.13  pid 4120  smb pipe'],
      [8.7, 'blue', '[c2] beacon WS11 lost (last seen 14:08:42)'],
      [8.8, 'blue', '[c2] beacon WS13 lost (last seen 14:08:48)'],
    ],
  },
  router: {
    title: 'R-01 Home router', src: 'openwrt · logread',
    lines: [
      [0.2, 'dim', 'kernel: nf_conntrack: NEW tcp 192.168.1.23:40112 → 198.51.100.0/28 (scan)'],
      [1.2, '', 'kernel: NAT 192.168.1.23 → 203.0.113.66 (wan0)'],
      [3.8, '', 'kernel: nf_conntrack: NEW tcp 192.168.1.23:51544 → 198.51.100.25:25'],
      [5.0, 'red', 'kernel: nf_conntrack: inbound https session 203.0.113.66:443 ⇄ 198.51.100.1'],
    ],
  },
  net: {
    title: 'I-00 Internet', src: 'traceroute mx.corp.example',
    lines: [
      [2.0, '', 'traceroute to mx.corp.example (198.51.100.25), 30 hops max'],
      [2.1, 'dim', ' 1  192.168.1.1        1.1 ms'],
      [2.2, 'dim', ' 2  203.0.113.1        6.8 ms'],
      [2.4, 'dim', ' 3  ae-1.core.ix.example  9.9 ms'],
      [2.6, 'dim', ' 4  ae-7.edge.ix.example 14.2 ms'],
      [2.8, '', ' 5  198.51.100.1       18.4 ms   (corp edge)'],
    ],
  },
  edge: {
    title: 'E-01 Edge router · ISP', src: 'ios syslog',
    lines: [
      [0.4, 'red', '%SEC-6-IPACCESSLOGP: list OUTSIDE-IN denied tcp 203.0.113.66 → 198.51.100.0/28, 412 packets'],
      [3.7, '', '%SEC-6-IPACCESSLOGP: list OUTSIDE-IN permitted tcp 203.0.113.66(51544) → 198.51.100.25(25)'],
      [5.0, '', '%SEC-6-IPACCESSLOGP: list INSIDE-OUT permitted tcp 198.51.100.1(49712) → 203.0.113.66(443)'],
      [9.3, 'blue', '%SYS-5-CONFIG_I: OUTSIDE-IN deny ip host 203.0.113.66 any (pushed by soar-svc)'],
    ],
  },
  xfw: {
    title: 'F-01 External firewall', src: 'pfsense · filterlog',
    lines: [
      [0.4, 'dim', 'block,in,WAN,tcp,203.0.113.66,198.51.100.10,61001,8080,S'],
      [3.7, '', 'pass,in,WAN,tcp,203.0.113.66,172.16.10.25,51544,25,S   rule: allow-smtp'],
      [5.0, 'red', 'pass,out,LAN,tcp,10.10.20.11,203.0.113.66,49712,443,S   rule: allow-web-egress'],
      [9.3, 'blue', 'block,out,LAN,tcp,10.10.20.11,203.0.113.66,49733,443,S   rule: SOAR-ioc-block'],
    ],
  },
  web: {
    title: 'D-01 Web', src: '/var/log/nginx/access.log',
    lines: [
      [0.5, 'dim', '203.0.113.66 "GET /robots.txt" 200 68 "Mozilla/5.0 (Nmap Scripting Engine)"'],
      [0.6, 'dim', '203.0.113.66 "GET /.git/HEAD" 404 153'],
      [0.7, 'dim', '203.0.113.66 "GET /wp-login.php" 404 153'],
      [0.8, 'dim', '203.0.113.66 "GET /server-status" 403 146   (waf: blocked)'],
    ],
  },
  mail: {
    title: 'D-02 Mail relay', src: '/var/log/mail.log',
    lines: [
      [3.8, '', 'postfix/smtpd[2211]: connect from unknown[203.0.113.66]'],
      [3.9, '', 'postfix/cleanup[2214]: 4F2A1C0: message-id=<inv-0938@billing-notice.example>'],
      [4.0, 'red', 'amavis[1902]: Passed CLEAN, <ap@billing-notice.example> → <m.rossi@corp.example>, invoice_0938.docm'],
      [4.2, '', 'postfix/lmtp[2219]: 4F2A1C0: to=<m.rossi@corp.example>, status=sent (250 2.0.0 Ok)'],
      [8.9, 'blue', 'postfix/postsuper: 4F2A1C0 + 3 similar: purged from mailboxes (soar-svc)'],
    ],
  },
  dns: {
    title: 'D-03 DNS · VPN', src: 'bind · query.log',
    lines: [
      [5.0, 'red', 'client 10.10.20.11#53311: query: cdn-telemetry.example IN A +'],
      [6.0, 'red', 'client 10.10.20.11#53340: query: cdn-telemetry.example IN A +   (every 60s)'],
      [7.0, 'red', 'client 10.10.20.13#61002: query: cdn-telemetry.example IN A +'],
      [9.3, 'blue', 'rpz: soar-blocklist: cdn-telemetry.example → NXDOMAIN'],
    ],
  },
  ifw: {
    title: 'F-02 Internal firewall', src: 'pf · pflog0',
    lines: [
      [4.9, 'dim', 'pass in on vlan20: 10.10.20.11 → 172.16.10.25:993 (imaps)'],
      [6.9, 'red', 'pass in on vlan20: 10.10.20.11 → 10.10.20.13:445 (smb)'],
      [7.5, 'red', 'pass in on vlan20: 10.10.20.13 → 10.10.30.10:135,49667 (rpc/drsuapi)'],
      [9.8, 'blue', 'rule added: block vlan20 → vlan30 proto {smb, rpc, winrm}  # SOAR'],
      [10.0, 'blue', 'block in on vlan20: 10.10.20.13 → 10.10.30.10:445'],
    ],
  },
  ws1: {
    title: 'U-11 Workstation · WS11', src: 'Windows 11 · Security + Sysmon',
    lines: [
      [4.6, 'dim', '4624  Logon Type 2 · CORP\\m.rossi (interactive)'],
      [4.9, 'red', 'Sysmon 1   WINWORD.EXE → powershell.exe -nop -w hidden -enc JABjAD0A…'],
      [5.0, 'red', 'Sysmon 3   powershell.exe → 203.0.113.66:443 (cdn-telemetry.example)'],
      [5.3, 'red', 'Sysmon 11  FileCreate C:\\Users\\m.rossi\\AppData\\Local\\Temp\\upd.dll'],
      [6.1, 'red', '4688  net.exe group "Domain Admins" /domain'],
      [6.3, 'red', '4688  nltest.exe /dclist:corp'],
      [8.6, 'blue', 'Elastic Defend: host isolated (policy SOAR-iso-01)'],
    ],
  },
  ws2: {
    title: 'U-12 Workstation · WS12', src: 'Windows 11 · Security',
    lines: [
      [1.0, 'dim', '4624  Logon Type 2 · CORP\\a.bianchi (interactive)'],
      [6.0, 'dim', '4634  Logoff · CORP\\a.bianchi'],
      [9.0, 'dim', 'nothing to see here. WS12 was never touched.'],
    ],
  },
  ws3: {
    title: 'U-13 Workstation · WS13', src: 'Windows 11 · Security + System',
    lines: [
      [6.9, 'red', '4624  Logon Type 3 · CORP\\helpdesk from 10.10.20.11 (NTLM)'],
      [7.0, 'red', '7045  Service installed: PSEXESVC  C:\\Windows\\PSEXESVC.exe'],
      [7.2, 'red', 'Sysmon 10  ProcessAccess lsass.exe ← rundll32 comsvcs.dll MiniDump'],
      [8.6, 'blue', 'Elastic Defend: host isolated (policy SOAR-iso-01)'],
    ],
  },
  file: {
    title: 'S-21 File server · FS01', src: 'samba · smbd_audit',
    lines: [
      [3.0, 'dim', 'm.rossi|10.10.20.11|open|ok|/finance/2026/Q4.xlsx'],
      [7.3, 'red', 'helpdesk|10.10.20.13|listdir|ok|/finance'],
      [9.8, 'blue', 'connection from 10.10.20.13 refused (F-02 policy)'],
    ],
  },
  app: {
    title: 'S-22 App server · APP01', src: '/var/log/auth.log',
    lines: [
      [2.0, 'dim', 'sshd[812]: Accepted publickey for deploy from 10.10.99.20'],
      [7.4, 'red', 'sshd[1440]: Failed password for invalid user admin from 10.10.20.13'],
      [7.5, 'red', 'sshd[1441]: Failed password for invalid user admin from 10.10.20.13'],
    ],
  },
  dc: {
    title: 'S-23 Domain controller · DC01', src: 'Windows Server · Security',
    lines: [
      [7.4, 'red', '4769  Kerberos TGS request · svc_backup · RC4 (0x17) from 10.10.20.13'],
      [7.8, 'red', '4662  DS access · Replicating Directory Changes All · CORP\\helpdesk (DCSync)'],
      [8.0, 'red', '4624  Logon Type 3 · CORP\\helpdesk from 10.10.20.13'],
      [8.9, 'blue', '4725  Account disabled · CORP\\helpdesk · by CORP\\soar-svc'],
      [9.0, 'blue', 'krbtgt reset 1/2 · scheduled 2/2 in 10h'],
    ],
  },
  siem: {
    title: 'C-00 SOC · Elastic + SOAR', src: 'Elastic Security · alerts / cases',
    lines: [
      [0.5, 'dim', 'alert  low      "Port scan detected"                 src=203.0.113.66'],
      [4.9, '', 'alert  low      "MS Office child process"            host=WS11'],
      [5.1, '', 'alert  medium   "Connection to newly observed domain" host=WS11'],
      [6.2, '', 'alert  medium   "Domain discovery via net/nltest"    host=WS11'],
      [7.1, 'red', 'alert  high     "Remote service installed (PsExec)"  host=WS13'],
      [7.8, 'red', 'alert  critical "Credential access via DCSync"       host=DC01'],
      [8.0, 'red', 'case   #2026-118 opened · 6 alerts correlated · risk 94'],
      [8.6, 'blue', 'soar   playbook iso-contain → isolate WS11, WS13'],
      [8.9, 'blue', 'soar   disable CORP\\helpdesk · purge phishing mail'],
      [9.3, 'blue', 'soar   block ioc 203.0.113.66, cdn-telemetry.example'],
      [10.6, 'blue', 'case   #2026-118 status → contained'],
    ],
  },
};
