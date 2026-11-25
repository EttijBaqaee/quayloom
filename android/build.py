#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""No Gradle/network/dependencies. Run on Debian with official SDK + JDK; see README."""
from pathlib import Path
import os,sys,subprocess,hashlib,json,zipfile,time,shutil,secrets
ROOT=Path(__file__).resolve().parent
assert sys.platform=='linux','Build only on designated Debian'
JAVA=Path(os.environ['JAVA_HOME']);SDK=Path(os.environ['ANDROID_HOME']);BT=SDK/'build-tools/36.0.0';ANDROID=SDK/'platforms/android-36/android.jar'
MODE=sys.argv[1] if len(sys.argv)>1 else 'unsigned'
assert MODE in ('unsigned','sign')
OUT=Path(os.environ.get('QUAYLOOM_ANDROID_OUT',ROOT/'build')).resolve();assert not OUT.is_relative_to(ROOT/'src')
OUT.mkdir(parents=True,exist_ok=True)
EPOCH=int(os.environ.get('SOURCE_DATE_EPOCH','1795382400'))
os.environ['JAVA_HOME']=str(JAVA);os.environ['PATH']=str(JAVA/'bin')+':'+os.environ['PATH'];os.environ['TZ']='UTC';os.environ['LC_ALL']='C.UTF-8'

def run(args):
    subprocess.run([str(x) for x in args],check=True,timeout=75,env={**os.environ,'JAVA_TOOL_OPTIONS':'-Xmx512m -Duser.timezone=UTC -Dfile.encoding=UTF-8'})
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def fixed_zip(target,entries):
    timestamp=time.gmtime(max(EPOCH,315532800))[:6]
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data,method in sorted(entries):
            i=zipfile.ZipInfo(name,timestamp);i.compress_type=method;i.external_attr=0o100644<<16;z.writestr(i,data)

source=Path(os.environ['QUAYLOOM_SOURCE_ZIP']).resolve();assert source.is_file()
with zipfile.ZipFile(source) as z:
    assert z.testzip() is None
    names=z.namelist();assert any(n.endswith('android/src/org/quayloom/android/MainActivity.java') for n in names)
    assert not any('/private/' in n or n.endswith(('.jks','.p12','.keystore','.apk')) for n in names)
    for p in sorted(ROOT.rglob('*')):
        if not p.is_file() or any(x in ('build','tests','__pycache__') for x in p.relative_to(ROOT).parts):continue
        relative='android/'+p.relative_to(ROOT).as_posix()
        matches=[n for n in names if n==relative or n.endswith('/'+relative)]
        assert len(matches)==1 and z.read(matches[0])==p.read_bytes(),'Android corresponding-source mismatch: '+relative
sourcehash=digest(source)
for name in ('classes','test-classes','dex','generated','assets'):
    directory=(OUT/name).resolve();assert directory.parent==OUT and directory.name==name
    if directory.exists():shutil.rmtree(directory)
if os.environ.get('QUAYLOOM_SOURCE_SHA256'):assert sourcehash==os.environ['QUAYLOOM_SOURCE_SHA256']
version='0.2.1'
gen=OUT/'generated/org/quayloom/android';gen.mkdir(parents=True,exist_ok=True)
(gen/'BuildInfo.java').write_text('package org.quayloom.android; final class BuildInfo { static final String VERSION="'+version+'"; static final String SOURCE_SHA256="'+sourcehash+'"; }\n')
assets=OUT/'assets';assets.mkdir(exist_ok=True);shutil.copyfile(source,assets/'source.zip')
resources=OUT/'resources.zip';run([BT/'aapt2','compile','--dir',ROOT/'res','-o',resources])
linked=OUT/'resources.apk';run([BT/'aapt2','link','-o',linked,'-I',ANDROID,'--manifest',ROOT/'AndroidManifest.xml','--min-sdk-version','26','--target-sdk-version','36','--auto-add-overlay','-A',assets,resources])
classes=OUT/'classes';classes.mkdir(exist_ok=True)
java=sorted((ROOT/'src').rglob('*.java'))+[gen/'BuildInfo.java']
run([JAVA/'bin/javac','--release','8','-encoding','UTF-8','-g:none','-classpath',ANDROID,'-d',classes,*java])
# Optional development regressions; excluded from clean corresponding-source distribution.
if (ROOT/'tests/EndpointTest.java').is_file():
    test=OUT/'test-classes';test.mkdir(exist_ok=True)
    run([JAVA/'bin/javac','-encoding','UTF-8','-d',test,ROOT/'src/org/quayloom/android/Endpoint.java',ROOT/'src/org/quayloom/android/LoginProtocol.java',*sorted((ROOT/'tests').glob('*.java'))])
    run([JAVA/'bin/java','-cp',test,'org.quayloom.android.EndpointTest'])
    run([JAVA/'bin/java','-cp',test,'org.quayloom.android.LoginProtocolTest'])
jar=OUT/'classes.jar';fixed_zip(jar,[(str(p.relative_to(classes)),p.read_bytes(),zipfile.ZIP_DEFLATED) for p in classes.rglob('*.class')])
dex=OUT/'dex';dex.mkdir(exist_ok=True);run([BT/'d8','--release','--min-api','26','--lib',ANDROID,'--output',dex,jar])
with zipfile.ZipFile(linked) as z:entries=[(n,z.read(n),zipfile.ZIP_STORED if n=='resources.arsc' else zipfile.ZIP_DEFLATED) for n in z.namelist() if not n.endswith('/')]
entries += [(p.name,p.read_bytes(),zipfile.ZIP_DEFLATED) for p in sorted(dex.glob('*.dex'))]
raw=OUT/'Quayloom-0.2.1-unsigned.apk';fixed_zip(raw,entries)
aligned=OUT/'Quayloom-0.2.1-aligned.apk';run([BT/'zipalign','-f','-P','16','4',raw,aligned]);run([BT/'zipalign','-c','-P','16','4',aligned])
if MODE=='sign':
    private=Path(os.environ['QUAYLOOM_SIGNING_DIR']).resolve()
    assert not private.is_relative_to(ROOT.parent) and not ROOT.parent.is_relative_to(private),'Signing directory must be outside the source tree and must not contain it'
    private.mkdir(mode=0o700,exist_ok=True);private.chmod(0o700)
    key=private/'quayloom-release.p12';password=private/'keystore-password'
    assert key.exists()==password.exists(),'Incomplete signing identity; do not regenerate'
    if not key.exists():
        fd=os.open(password,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:f.write(secrets.token_urlsafe(48)+'\n')
        run([JAVA/'bin/keytool','-genkeypair','-keystore',key,'-storetype','PKCS12','-alias','quayloom','-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000','-dname','CN=Quayloom Android Release, O=Quayloom','-storepass:file',password,'-keypass:file',password])
        key.chmod(0o600)
    signed=OUT/'Quayloom-0.2.1.apk'
    # PKCS12 key uses the store password; omit --key-pass so apksigner reuses it without consuming a second file line.
    run([BT/'apksigner','sign','--ks',key,'--ks-key-alias','quayloom','--ks-pass','file:'+str(password),'--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',signed,aligned])
    run([BT/'apksigner','verify','--verbose','--print-certs',signed]);run([BT/'zipalign','-c','-P','16','4',signed]);artifact=signed
else:artifact=aligned
run([BT/'aapt2','dump','badging',artifact])
with zipfile.ZipFile(artifact) as z:
    assert z.testzip() is None and hashlib.sha256(z.read('assets/source.zip')).hexdigest()==sourcehash
report={'apk':str(artifact),'sha256':digest(artifact),'bytes':artifact.stat().st_size,'sourceSha256':sourcehash,'minSdk':26,'targetSdk':36,'signed':MODE=='sign','runtimeDeviceTest':False}
(OUT/'build-result.json').write_text(json.dumps(report,indent=2));print('ANDROID_BUILD_RESULT '+json.dumps(report))
