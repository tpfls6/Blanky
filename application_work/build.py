from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from pathlib import Path
from copy import deepcopy

base=Path(__file__).parent
ns={'p':'http://www.hancom.co.kr/hwpml/2011/paragraph'}
P='{'+ns['p']+'}'
z=ZipFile(base/'template.hwpx')
s=E.fromstring(z.read('Contents/section1.xml'))
ps=s.findall('.//p:p',ns)
title='IRIS — 로컬 AI 통합 실행 및 사용자 작업 자동화 에이전트'
def put(p,text):
    for r in p.findall(P+'run'): p.remove(r)
    for q in p.findall(P+'linesegarray'): p.remove(q)
    r=E.SubElement(p,P+'run',charPrIDRef='29')
    E.SubElement(r,P+'t').text=text
def fill(i,lines):
    anchor=ps[i]
    anchor.set('paraPrIDRef','87')
    put(anchor,lines[0])
    for t in lines[1:]:
        n=deepcopy(anchor); put(n,t); anchor.addnext(n); anchor=n

put(ps[6],title); put(ps[81],title)
fill(88,[
'학생·취업준비생·초보 개발자가 AI를 학습과 프로젝트에 활용하려면 모델 설치, 실행환경 설정, 도구 연결을 각각 수행해야 한다. 로컬 AI는 외부 API 사용 부담을 줄일 수 있으나 설치 오류와 명령어 중심 인터페이스가 진입장벽으로 작용한다.',
'INDEX3는 Ollama와 Hermes Agent를 설치·연결하는 과정에서 환경설정 오류와 반복적인 프롬프트 입력의 불편을 경험하였다. 이를 해결하기 위해 Windows PC에서 모델과 도구를 하나의 화면으로 연결하는 오픈소스 AI 에이전트 IRIS를 개발하였다.',
'현재 구현한 통합 실행환경을 바탕으로 초기 설치의 안정성, 반복 작업 자동화, 음성 상호작용의 완성도를 높여 실제 교육·업무 환경에서 사용할 수 있는 제품으로 발전시키고자 한다.' ])
fill(91,[
'개발 목적은 사용자가 복잡한 설정 없이 자신의 PC에서 AI를 실행하고, 자연어로 파일·터미널·웹 도구를 활용하도록 지원하는 것이다. 대화 응답을 실제 작업 수행으로 연결하여 AI 활용 범위를 넓힌다.',
'사업화지원 기간에는 ① 설치·실행 실패 원인과 복구 절차 정리 ② 파일 정리·자료 검색·프로젝트 보조의 대표 활용 시나리오 검증 ③ 화면 기반 작업 기록 및 음성 입출력의 안정화 ④ 선행기술조사와 차별화 요소의 권리화 가능성 검토를 추진한다.',
'검증 항목은 신규 환경 설치 성공 여부, 대표 작업의 완료 여부와 오류 유형, 음성 출력 중 재입력 발생 여부, 사용자의 추가 설정 부담으로 정한다. 개선 전후 결과를 기록하여 최종보고회에서 제시한다.' ])
fill(94,[
'1차 목표 고객은 Windows PC를 사용하는 대학생·초보 개발자와 AI 실습을 운영하는 대학·교육기관이다. 개인에게는 설치 편의성과 학습·개발 보조가, 교육기관에는 실습환경 구성과 반복적인 설치 지원 부담의 감소가 주요 가치이다.',
'2차 고객은 문서·파일·정보 검색 업무가 반복되는 소규모 조직이다. 고객 인터뷰와 시범 사용을 통해 로컬 처리 요구, 보유 PC 사양, 도입 지원 수요를 확인한 뒤 적용 범위를 확대한다.',
'대체 수단은 웹 기반 AI 서비스, 개별 로컬 모델 실행 도구, 별도 자동화 프로그램이다. IRIS는 모델 설치·실행과 작업 도구를 통합하고 사용자의 PC에서 작업을 이어가는 경험으로 경쟁한다. 초기에는 범용 기능 확대보다 교육·개발 현장의 반복 업무를 우선 검증한다.',
'시장 규모·유료 전환율·매출은 아직 검증되지 않았으므로 도입 성과로 단정하지 않는다. 지원사업의 시장분석을 활용해 고객군별 수요와 지불 의사를 확인하고, 설치·교육·유지보수 지원의 사업성을 구체화한다.' ])
fill(101,[
'현재 구현 기반: Windows 10·11, Python 3.11 이상, PyQt6 GUI를 사용한다. PowerShell 기반 초기 환경 점검과 Ollama·Hermes Agent 자동 설치·연결을 통해 명령어 중심 도구를 데스크톱 화면에서 이용하도록 구성하였다.',
'AI 실행 및 도구 연계: Ollama 기반 로컬·클라우드 모델 연동과 Hermes Agent 기반 파일·터미널·웹·MCP 도구 실행을 연결한다. SQLite로 사용자 설정·대화 기록을 관리하고, Markdown 및 Obsidian 호환 Iris Wiki로 지식을 축적한다.',
'확장 기능: ShowUI-Aloha 기반 화면·작업 기록 기능, faster-whisper 기반 STT, Qwen TTS 기반 음성 출력을 활용한다. 모델 가중치를 자체 학습하는 방식이 아니라 기존 모델과 오픈소스를 통합하는 구조이다.',
'보완 과제: 운영체제별 패키징, 사용환경별 실행 안정성, TTS 음성이 STT에 재입력되는 현상, 작업 기록의 자동화 연결을 개선한다. 지원 기간에는 Windows 기반 핵심 시나리오를 먼저 검증하며, 다중 운영체제와 자체 IDE는 후속 확장 과제로 둔다.' ])
fill(104,[
'첫째, 모델·에이전트·도구의 설치와 실행을 하나의 GUI에서 연결한다. 개별 도구의 성능을 새로 주장하기보다 초보 사용자가 실제 작업까지 도달하는 절차를 줄이는 데 집중한다.',
'둘째, 텍스트 대화와 파일·터미널·웹 도구, 지식 저장, 음성 입출력, 화면 기반 작업 기록을 연결하여 사용자 맥락을 이어가는 작업 흐름을 제공한다. 로컬 실행 여부와 외부 연동 범위를 사용자에게 명확히 안내하는 방향으로 개선한다.',
'셋째, 권리화 검토 대상은 기존 공개 라이브러리 자체가 아니라 통합 환경 점검·설치·복구 흐름, 작업 기록을 실행 절차로 연결하는 방식, 음성 입출력 충돌 제어 등 직접 구현한 결합 구조이다. 신규성·진보성과 실제 발명 기여는 전담 변리사의 선행기술조사로 확인한다.',
'공개 저장소와 대회 보고서 등 기존 공개 이력을 정리하여 컨설팅 시 제공하고, 이미 공개한 내용과 추가 개발 내용을 구분하여 출원 가능 범위를 검토한다. 특허 확보를 확정 성과로 제시하지 않는다.' ])
fill(107,[
'제품 전략: 오픈소스 기본 제품을 통해 사용자 접근성을 높이고, 초기 설치 안내·오류 복구·대표 업무 예제를 표준화하여 도입 부담을 낮춘다. 기능 수보다 설치와 작업 완료의 재현성을 우선 확보한다.',
'사업모델 검증: 대학·교육기관 대상 실습환경 구축, 도입 교육, 소규모 조직 대상 맞춤 도구 연동·유지보수 서비스를 후보로 검토한다. 유료 수요와 제공 범위는 인터뷰·시범 운영을 거쳐 결정하며, 확정 고객이나 매출 실적으로 표현하지 않는다.',
'라이선스 대응: IRIS의 GPL-3.0-or-later 및 포함 구성요소의 배포 조건을 목록화한다. 배포 방식별 소스 제공·고지 의무를 확인하고, 설치·교육·지원 서비스의 범위와 함께 검토한다.',
'추진 일정: 선정 후 2026년 12월에는 고객 요구·기존 공개 이력·선행기술을 정리하고, 2027년 1월 22일까지 전문가 컨설팅 2회와 핵심 기능 검증을 수행한다. 1월 최종보고회에서는 개선 결과와 사업화 가설, 권리화 검토 결과를 제시하고, 출원 여부가 정해지면 후속 절차에 협조한다.' ])
fill(110,['[IRIS_IMAGE]','그림 1. IRIS 실행 화면(2026 오픈소스 개발자대회 결과보고서 수록 자료).','구성 흐름: 사용자 자연어·음성 입력 → IRIS 통합 GUI → Ollama 모델·Hermes Agent → 파일·터미널·웹 도구 → 실행 결과 및 대화·지식 저장.'])
fill(113,[
'AI 활용 접근성: 설치·환경설정 부담을 줄여 학생과 초보 개발자가 학습·프로젝트에 AI를 활용할 수 있도록 돕는다. 교육기관은 공통 실습환경과 안내 자료를 활용하여 초기 운영 부담을 줄일 수 있다.',
'업무 생산성: 파일 정리·자료 탐색·개발 보조 등 반복 업무를 자연어 기반 작업으로 연결한다. 효과는 대표 시나리오별 수행 결과와 사용자 피드백을 통해 확인한다.',
'데이터 선택권과 기술 공유: 로컬 모델을 선택할 수 있도록 하여 외부 전송을 줄일 수 있는 환경을 제공한다. 실제 전송 범위는 사용 도구에 따라 달라짐을 안내한다. 공개 소스와 문서·개선 이력을 공유하여 재사용 가능한 교육·개발 기반을 축적한다.' ])
fill(120,[
'IRIS 개발팀은 Python·PyQt6 기반 GUI, 로컬 AI 실행환경 구성, 에이전트·외부 도구 연계, 데이터 저장 및 음성 입출력 기능을 통합한 프로젝트 경험을 보유한다. 결과보고서에는 설치 과정의 오류 해결, 기능 테스트, 문서화와 개선 계획이 정리되어 있다.',
'대표학생의 개인별 담당 업무와 보유역량:　　　　　　　　　　　　　　　　　　　　　　',
'선정 후 대표학생은 전체 일정과 요구사항을 조율하고, 컨설팅 대응 및 최종 성과 정리를 총괄하는 방식으로 역할을 확정할 계획이다.' ])
fill(123,[
'개발팀 INDEX3는 결과보고서 기준 총 4명으로 구성되어 있다. 공동 결과물인 IRIS의 통합 기능과 공개 저장소를 개발 역량의 근거로 제시하며, 개인별 구현 범위는 실제 기여 내용을 확인하여 기재한다.',
'팀원별 담당 업무·보유역량:　　　　　　　　　　　　　　　　　　　　　　　　　　　',
'후속 개발은 GUI·설치환경, 모델·도구 연계, 음성·작업 기록, 검증·문서화 업무로 나누어 담당자를 확정하고, 오류 기록과 변경 이력을 공동 관리할 계획이다.' ])
fill(130,['교내 프로그램 참여 경력:　　　　　　　　　　　　　　　　　　　　　　　　　　　　','교내 수상 이력:　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　'])
fill(133,[
'2026 오픈소스 개발자대회: INDEX3(팀원 4명), 참가번호 148. 「AI 활용 장벽을 낮추는 오픈소스 AI 에이전트 IRIS」 결과보고서 작성 및 프로젝트 공개 저장소 운영.',
'공개 저장소: https://github.com/kwakminoo/Project-IRIS-Light',
'교외 수상 이력:　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　',
'개발 지속 계획: 대회 프로젝트를 기반으로 설치 안정성, 음성 입출력 충돌, 작업 자동화의 완성도를 개선한다. 본 지원사업을 통해 기술 구현 경험에 고객 수요 검증과 지식재산 검토를 더하여 실제 도입 가능한 결과물로 발전시키고자 한다.' ])
# Preserve all application tables and consent wording. Remove only the notice section.
s2=E.fromstring(z.read('Contents/section2.xml'))
put(s2.findall('.//p:p',ns)[63],title)
header=E.fromstring(z.read('Contents/header.xml')); header.set('secCnt','2')
HH='{http://www.hancom.co.kr/hwpml/2011/head}'
HC='{http://www.hancom.co.kr/hwpml/2011/core}'
para=next(n for n in header.iter(HH+'paraPr') if n.get('id')=='77')
body=deepcopy(para)
body.set('id','87')
body.find(HH+'margin').find(HC+'intent').set('value','0')
body.find(HH+'breakSetting').set('keepLines','1')
para.getparent().append(body)
para.getparent().set('itemCnt',str(len(para.getparent())))
hpf=E.fromstring(z.read('Contents/content.hpf'))
for node in list(hpf.iter()):
    if node.get('id')=='section0' or node.get('idref')=='section0': node.getparent().remove(node)
    elif node.get('id')=='section1': node.set('id','section0'); node.set('href','Contents/section0.xml')
    elif node.get('id')=='section2': node.set('id','section1'); node.set('href','Contents/section1.xml')
    elif node.get('idref')=='section1': node.set('idref','section0')
    elif node.get('idref')=='section2': node.set('idref','section1')
repl={'Contents/section0.xml':E.tostring(s,xml_declaration=True,encoding='UTF-8'),'Contents/section1.xml':E.tostring(s2,xml_declaration=True,encoding='UTF-8'),'Contents/header.xml':E.tostring(header,xml_declaration=True,encoding='UTF-8'),'Contents/content.hpf':E.tostring(hpf,xml_declaration=True,encoding='UTF-8')}
with ZipFile(base/'filled.hwpx','w',ZIP_DEFLATED) as out:
    for name in z.namelist():
        if name=='Contents/section2.xml': continue
        out.writestr(name,repl.get(name,z.read(name)))
report=ZipFile(r'C:\Users\serin\프로젝트\프로젝트 보고서 모음\2026 오픈소스 개발자대회 결과보고서_148(INDEX3).docx')
for name in report.namelist():
    if name.startswith('word/media/'):
        (base/Path(name).name).write_bytes(report.read(name))
print('filled.hwpx created')
