import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { hashFlag } from "./domain.js";

const lessons = [
  ["Foundations","Ethics, law and permission","Learn why authorization is the first rule of security research. India’s Information Technology Act, 2000 (including amendments) criminalizes certain unauthorized access and related acts; obtain explicit written permission and follow scope, privacy, and disclosure rules.","ethics"],
  ["Foundations","The CIA triad","Confidentiality limits access to authorized people; integrity protects information from improper change; availability keeps services usable. Controls often trade off across all three.","cia"],
  ["Foundations","The penetration-testing lifecycle","Scope and permission, reconnaissance, controlled validation, impact analysis, cleanup, and a clear report form a responsible assessment lifecycle. Stop when scope or safety is uncertain.","lifecycle"],
  ["Web Security","HTTP basics","HTTP requests carry a method, path, headers, and sometimes a body. Responses include a status, headers, and content. HTTPS protects transport with TLS, not application logic.","http"],
  ["Web Security","SQL injection and XSS","Injection happens when data is treated as executable syntax. Parameterized queries keep SQL structure separate from values. Context-aware output encoding prevents browser markup from becoming script.","injection"],
  ["Web Security","Access control and IDOR","Authorization must be checked for every object, not inferred from an opaque identifier. An insecure direct object reference occurs when changing an ID reveals another user’s resource.","idor"],
  ["Network Security","Networking essentials","IP addresses identify network interfaces, ports identify transport endpoints, and DNS maps names to records. TCP provides ordered delivery; UDP is connectionless.","network"],
  ["Network Security","Safe scanning and service discovery","Only scan assets you own or have written permission to test. Define target ranges and rate limits first; interpret service banners as clues, not proof of vulnerabilities.","scanning"],
  ["Network Security","Firewalls and TLS","Firewalls apply traffic policy at network boundaries. TLS authenticates endpoints and encrypts transport when configured correctly; certificates and protocol versions matter.","firewalls"],
  ["Crypto and Defence","Hashing and passwords","Cryptographic hashes are one-way digests, but fast MD5/SHA hashes are unsuitable for password storage. Use unique salts and a slow password KDF such as Argon2id or bcrypt.","hashing"],
  ["Crypto and Defence","Encryption fundamentals","Symmetric encryption uses a shared secret; public-key cryptography uses related key pairs. Authenticated encryption protects confidentiality and detects tampering.","encryption"],
  ["Crypto and Defence","Blue team basics","Defenders reduce risk through inventory, patching, least privilege, backups, monitoring, incident response, and tested recovery plans. Preserve evidence and communicate clearly.","blue-team"]
];
const quizzes: Array<[string,string[],number,string]> = [
 ["What should come before any security test?",["Written authorization and scope","A public IP address","A vulnerability scanner"],0,"Permission and scope are mandatory."],
 ["Which CIA property prevents unauthorized disclosure?",["Availability","Confidentiality","Integrity"],1,"Confidentiality controls disclosure."],
 ["What is the first lifecycle step?",["Exploit","Scope and permission","Publish findings"],1,"Define authorization and scope first."],
 ["What does an HTTP response contain?",["Status, headers, optional body","Only a hostname","A private key"],0,"Responses carry status, headers, and content."],
 ["What is the primary SQLi prevention?",["String concatenation","Parameterized queries","Hiding errors only"],1,"Keep data separate from SQL syntax."],
 ["How should an API protect an invoice?",["Check ownership on every request","Use sequential IDs only","Hide the link"],0,"Server-side object authorization is essential."],
 ["What does DNS do?",["Maps names to records","Encrypts HTTP","Filters ports"],0,"DNS resolves domain names."],
 ["When is a scan acceptable?",["On any reachable host","Only with authorization and scope","Only at night"],1,"Written permission and scope are required."],
 ["What does TLS primarily protect?",["Transport confidentiality and integrity","Database normalization","Source-code formatting"],0,"TLS secures communication in transit."],
 ["Why is MD5 unsuitable for passwords?",["It is too slow","It is fast and collision-broken","It requires a certificate"],1,"Password hashes need slow KDFs."],
 ["What does authenticated encryption provide?",["Confidentiality and tamper detection","Only compression","Account recovery"],0,"AEAD detects ciphertext tampering."],
 ["What is a blue-team priority?",["Least privilege and monitoring","Unscoped scanning","Sharing passwords"],0,"Least privilege and visibility reduce risk."]
];
const additionalQuizzes: Array<Array<[string,string[],number,string]>> = [
 [
  ["Which Indian law is highlighted in this lesson?",["Information Technology Act, 2000","Consumer Protection Act, 2019","Indian Contract Act, 1872"],0,"The lesson introduces the Information Technology Act, 2000 and amendments."],
  ["What should you do if a target appears outside the written scope?",["Stop and ask the system owner","Continue carefully","Only collect public information"],0,"Do not test outside the authorized scope."]
 ],
 [
  ["Which CIA property protects data from unauthorized changes?",["Confidentiality","Integrity","Availability"],1,"Integrity is about accurate, authorized changes."],
  ["Which control is most directly about service uptime?",["Availability","Confidentiality","Non-repudiation"],0,"Availability keeps services usable."]
 ],
 [
  ["What should happen after controlled validation?",["Report findings and clean up","Expand the target list","Keep any discovered data"],0,"Document findings, clean up, and report responsibly."],
  ["Why define test scope first?",["To set authorization and boundaries","To guarantee a vulnerability exists","To avoid writing a report"],0,"A clear scope prevents unauthorized testing."]
 ],
 [
  ["Which HTTP method is commonly used to retrieve a resource?",["GET","PATCH","CONNECT"],0,"GET requests representation of a resource."],
  ["Does HTTPS prove an application is free of bugs?",["Yes, TLS prevents all web attacks","No, TLS protects transport, not app logic","Yes, if the certificate is valid"],1,"TLS does not fix application-level flaws."]
 ],
 [
  ["What is cross-site scripting (XSS)?",["Untrusted content is interpreted as active browser markup or script","A database backup format","An encrypted DNS query"],0,"XSS involves unsafe interpretation of untrusted output."],
  ["Where should untrusted data be encoded?",["For its output context","Only before database storage","Only in a URL"],0,"Context-aware output encoding is essential."]
 ],
 [
  ["Why are sequential or random-looking IDs not authorization?",["An ID alone does not prove the requester owns the object","Random IDs always leak","Authorization belongs only in the browser"],0,"Check permission for every requested object."],
  ["What should an invoice API verify?",["The signed-in user's access to that invoice","Whether the ID is hard to guess","Only that the invoice exists"],0,"Enforce ownership or explicit access rights server-side."]
 ],
 [
  ["Which transport protocol provides ordered delivery?",["TCP","UDP","DNS"],0,"TCP provides a reliable ordered byte stream."],
  ["What does a port identify?",["A transport service endpoint","A country","A TLS certificate"],0,"Ports identify application endpoints on a host."]
 ],
 [
  ["What should be agreed before an authorized scan?",["Target scope and rate limits","A public bug bounty account","The scanner brand"],0,"Scope and safe traffic limits should be agreed in advance."],
  ["A service banner is best treated as…",["A clue that needs validation","Proof that a vulnerability exists","Permission to exploit the host"],0,"Banners can be inaccurate and are not proof."]
 ],
 [
  ["What does HSTS tell a browser?",["Use HTTPS for the site for the policy duration","Disable certificate validation","Trust every subdomain's scripts"],0,"HSTS helps browsers require secure transport."],
  ["What does a firewall primarily enforce?",["Traffic policy at network boundaries","Password hashing","Browser output encoding"],0,"Firewalls filter traffic according to policy."]
 ],
 [
  ["What should password storage use?",["A unique salt and slow password KDF","A fast unsalted MD5","Reversible encryption with a shared key"],0,"Use a dedicated slow password hashing function."],
  ["Which listed hash is unsuitable for password storage?",["MD5","Argon2id","bcrypt"],0,"MD5 is too fast and has known collision weaknesses."]
 ],
 [
  ["What is symmetric encryption?",["Encryption and decryption use a shared secret key","Every message uses a public DNS key","A one-way digest"],0,"Symmetric schemes use the same shared secret."],
  ["What extra property does authenticated encryption add?",["Tamper detection","Password recovery","Automatic key rotation"],0,"Authenticated encryption detects tampering."]
 ],
 [
  ["What should defenders do with incident evidence?",["Preserve it and follow response procedures","Delete logs immediately","Share it publicly"],0,"Preserve evidence while following the incident plan."],
  ["What does least privilege mean?",["Grant only access needed for a task","Give every account administrator access","Reuse one team password"],0,"Limit access to the minimum necessary."]
 ]
];
const labs: Array<[string,string,string,string,string,number,string[]]> = [
 ["Base64 basics","Web","Easy","Decode `V0R7YmFzZTY0X2Rvam99` and submit the decoded WD flag.","WD{base64_dojo}",100,["Use a Base64 decoder; the result itself is the flag."]],
 ["Caesar shift","Crypto","Easy","Shift `ZG{fdhvdu_flskhu}` backward by 3 letters. Submit the decoded WD flag.","WD{caesar_cipher}",100,["Try ROT shifts; letters wrap around the alphabet."]],
 ["Stacked encodings","Crypto","Medium","Decode the Base64 text `V0QlN0JzdGFja2VkX2VuY29kaW5ncyU3RA==` then URL-decode the result. Submit the decoded WD flag.","WD{stacked_encodings}",150,["There are two layers; decode Base64 first."]],
 ["Legacy digest","Crypto","Easy","A training system stored MD5 `5f4dcc3b5aa765d61d8327deb882cf99`. Recover the weak word from the included tiny wordlist: password, letmein, dojo.","WD{password}",120,["This is a deliberately tiny offline wordlist exercise."]],
 ["JWT claim inspection","Web","Easy","Inspect this untrusted token payload: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkb2pvIiwicm9sZSI6ImxlYXJuZXIiLCJmbGFnIjoiV0R7and0X2NsYWltc30ifQ.` Submit its flag claim.","WD{jwt_claims}",120,["Decode the second JWT segment; decoding does not verify a signature."]],
 ["Hidden HTML comment","Web","Easy","Inspect the sample page source: `<main>Welcome</main><!-- hidden_comment -->`. Wrap the hidden text in the WD flag format.","WD{hidden_comment}",100,["HTML comments remain visible in page source."]],
 ["SQLi login (simulated)","Web","Medium","In the offline toy login, `learner` / `dojo-pass` works. Try the username `admin'--` and inspect the fake parser response. Submit the safest SQL query defense as a WD flag. No SQL is executed.","WD{parameterized_queries}",180,["Compare unsafe string-building with bound values conceptually; this target is a fixed toy parser."]],
 ["Stored XSS guestbook (simulated)","Web","Medium","Submit text `<script>alert(1)</script>` to the inert guestbook detector. Nothing executes or persists. Submit the browser defense that treats output as data.","WD{output_encoding}",180,["The detector recognizes markup patterns but never renders or runs input."]],
 ["IDOR invoice viewer (simulated)","Web","Medium","The toy invoice viewer has invoice IDs 1001 (yours) and 1002 (another demo user). Identify the server-side check missing from the demo and submit it as a WD flag.","WD{check_object_ownership}",180,["Changing an ID must never bypass server-side authorization."]],
 ["Port-scan reading","Network","Easy","Training output: `22/tcp open ssh`, `443/tcp open https`. Identify the web TLS port and use it in a WD flag.","WD{port_443}",100,["HTTPS conventionally uses TCP port 443."]],
 ["Security header analysis","Web","Easy","A response omits Content-Security-Policy and Strict-Transport-Security. Combine the two header acronyms in a WD flag.","WD{csp_hsts}",120,["Content-Security-Policy and Strict-Transport-Security are the missing headers."]]
];

const seed = db.transaction(() => {
  for (const [track,title,content,slug] of lessons) {
    db.prepare("INSERT OR IGNORE INTO lessons(track,title,content,slug,position) VALUES(?,?,?,?,?)").run(track,title,content,slug,lessons.findIndex(x=>x[3]===slug)+1);
  }
  for (let i=0;i<lessons.length;i++) {
    const lessonId = db.prepare("SELECT id FROM lessons WHERE slug=?").get(lessons[i][3]) as {id:number};
    for(const q of [quizzes[i]!,...additionalQuizzes[i]!]){
      db.prepare("INSERT INTO quiz_questions(lesson_id,question,options,answer,explanation) SELECT ?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM quiz_questions WHERE lesson_id=? AND question=?)")
        .run(lessonId.id,q[0],JSON.stringify(q[1]),q[2],q[3],lessonId.id,q[0]);
    }
  }
  for (const [title,category,difficulty,description,flag,points,hints] of labs) {
    const previousSlug=title.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    const slug=previousSlug.replace(/^-+|-+$/g,"");
    if(previousSlug!==slug)db.prepare("UPDATE labs SET slug=? WHERE slug=?").run(slug,previousSlug);
    db.prepare("INSERT OR IGNORE INTO labs(title,slug,category,difficulty,description,flag_hash,points) VALUES(?,?,?,?,?,?,?)")
      .run(title,slug,category,difficulty,description,hashFlag(flag),points);
    const id = db.prepare("SELECT id FROM labs WHERE slug=?").get(slug) as {id:number};
    hints.forEach((hint,position)=>db.prepare("INSERT INTO lab_hints(lab_id,body,position) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM lab_hints WHERE lab_id=? AND position=?)").run(id.id,hint,position+1,id.id,position+1));
  }
  const email = process.env.ADMIN_EMAIL ?? "admin@whitehatdojo.local";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const admin=db.prepare("INSERT OR IGNORE INTO users(username,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run("admin",email,bcrypt.hashSync(password,12));
  return admin.changes>0;
});
const adminCreated=seed();
console.log(adminCreated
  ? process.env.NODE_ENV==="production"
    ? "Seed complete. Initial admin was created; retrieve its password from the deployment environment and change it after signing in."
    : `Seed complete. Initial admin: admin / ${process.env.ADMIN_EMAIL ?? "admin@whitehatdojo.local"} / ${process.env.ADMIN_PASSWORD ?? "ChangeMe123!"}`
  : "Seed complete. Existing admin credentials were not changed.");
