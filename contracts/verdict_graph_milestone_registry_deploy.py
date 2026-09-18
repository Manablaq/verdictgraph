# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from dataclasses import dataclass
from datetime import datetime,timezone
import hashlib
import json
from typing import Any,cast
from genlayer import*
G39=Address('0x0000000000000000000000000000000000000000')
G31=160
G19=4000
G14=160
G9=160
G36=768
G35=64
G38=16
G18=1200
G25=1200
G17=2000
G23=48000
G12=32000
G10=64000
G34=2
G41=(1<<256)-1
G5=900
G1=900
G4=900
G3=300
G2=30*24*60*60
G0=365*24*60*60
G32='DRAFT'
G30='ACTIVE'
G21='SUBMITTED'
G8='REVIEW_PENDING'
G24='REVIEWED'
G15='CHALLENGED'
G7='REPAIR_REQUIRED'
G26='SETTLED'
G20='RECOVERED'
G45='OK'
G13='REPAIR_REQUIRED'
G44=('PASS','FAIL','UNDETERMINED')
G29=1
G28=2
G16=3
def G47(message):raise gl.vm.UserError(message)
def G46(value):
	if isinstance(value,Address):return value
	return Address(value)
def G49():return u256(int(datetime.now(timezone.utc).timestamp()))
def G33(value):return json.dumps(value,sort_keys=True,separators=(',',':'))
def G40(value):return hashlib.sha256(value.encode('utf-8')).hexdigest()
def G48(a):
	a=a.strip()
	if len(a)!=G35 or not all((b in '0123456789abcdef' for b in a)):G47('E1')
	return a
def G37(a,maximum):
	a=a.strip()
	if not a or len(a)>maximum:G47('E2')
	return a
def G43(c):
	c=G37(c,G36)
	if not c.startswith('https://')or len(c)<=len('https://')or any((d.isspace()for d in c)):G47('E3')
	a=c[len('https://'):].split('/',1)[0].split('?',1)[0].split('#',1)[0];b=a.lower().split('.')
	if not a or '@' in a or ':' in a or any((d in a for d in '\\%<>')):G47('E4')
	if len(b)==4 and all((e.isdigit()for e in b))and all((0<=int(e)<=255 for e in b)):G47('E4')
	if len(b)<2 or any((not e or e[0]=='-' or e[-1]=='-' or(not all((d.isascii()and(d.isalnum()or d=='-')for d in e)))for e in b)):G47('E4')
	if a.lower()in('localhost','localhost.localdomain')or a.lower().endswith('.local'):G47('E4')
	return c
def G42(value):
	a=value[len('https://'):].split('/',1)[0].split('?',1)[0].split('#',1)[0];return f'https://{a.lower()}'
def G6(uri,allowed_origins_json):
	try:a=json.loads(allowed_origins_json)
	except Exception:G47('E5')
	if not isinstance(a,list)or not all((isinstance(b,str)for b in a)):G47('E5')
	return G42(uri)in a
def G22(criteria_json):
	try:e=json.loads(criteria_json)
	except Exception:G47('E6')
	if not isinstance(e,list)or not e or len(e)>G38:G47('E7')
	c=[];b=[]
	for item in e:
		if not isinstance(item,dict):G47('E8')
		a=item.get('id');d=item.get('text')
		if not isinstance(a,int)or isinstance(a,bool)or a<=0 or(a in c):G47('E9')
		if not isinstance(d,str):G47('E10')
		c.append(a);b.append({'id':a,'text':G37(d,G18)})
	b.sort(key=lambda item:item['id']);return b
def G27(criteria,criterion_id):return any((a['id']==criterion_id for a in criteria))
def G11(decision,failed_criterion_id,consequence_rule_id,criteria_json):
	if decision not in G44:G47('E11')
	b=json.loads(criteria_json);c=int(failed_criterion_id);a=int(consequence_rule_id)
	if decision=='FAIL':
		if not G27(b,c)or a!=G28:G47('E12')
	elif c!=0 or a!=(G29 if decision=='PASS' else G16):G47('E13')
@allow_storage
@dataclass
class Milestone:
	project_ref:str;reference:str;owner:Address;beneficiary:Address;title:str;objective:str;baseline_uri:str;baseline_sha256:str;criteria_json:str;submission_origins_json:str;terms_sha256:str;principal_required:u256;beneficiary_bond_required:u256;funding_deadline:u256;submission_deadline:u256;recovery_deadline:u256;challenge_window_seconds:u256;status:str;submission_version:u256;submission_uri:str;submission_sha256:str;sponsor_ready:bool;beneficiary_ready:bool;challenge_count:u256;challenge_reason:str;challenged_by:Address;challenged_at:u256;challenge_deadline:u256;settlement_earliest_at:u256;settlement_queued:bool;settlement_attempt_count:u256;settlement_last_attempt_at:u256;latest_review_id:u256;review_request_id:u256;review_queued:bool;repair_failure_code:str;repair_observed_sha256:str;created_at:str
@allow_storage
@dataclass
class Submission:
	milestone_id:u256;version:u256;uri:str;sha256:str;submitted_by:Address;submitted_at:u256;created_at:str
@allow_storage
@dataclass
class Review:
	milestone_id:u256;request_id:u256;submission_version:u256;challenge_count:u256;decision:str;failed_criterion_id:u256;consequence_rule_id:u256;source_set_sha256:str;summary:str;review_sha256:str;resolved_at:str
@allow_storage
@dataclass
class Challenge:
	milestone_id:u256;challenge_number:u256;reason:str;challenged_by:Address;challenged_at:u256;resolved_review_id:u256;created_at:str
@gl.contract_interface
class VerdictGraphMilestoneAdjudicator:
	class View:
		def registry_address(self,/)->Address:...
	class Write:
		def review_milestone(self,milestone_id:u256,request_id:u256,context_json:str,/)->None:...
@gl.contract_interface
class VerdictGraphMilestoneAuthority:
	class View:
		def get_project_snapshot(self,project_ref:str,/)->str:...
	class Write:pass
@gl.evm.contract_interface
class VerdictGraphMilestoneVault:
	class View:pass
	class Write:
		def register_milestone(self,milestone_id:u256,owner:Address,beneficiary:Address,principal_required:u256,beneficiary_bond_required:u256,funding_deadline:u256,recovery_deadline:u256,terms_sha256:str,/)->None:...
		def apply_final_outcome(self,milestone_id:u256,review_id:u256,terms_sha256:str,consequence_rule_id:u256,review_sha256:str,/)->None:...
		def recover_active(self,milestone_id:u256,/)->None:...
class VerdictGraphMilestoneRegistry(gl.Contract):
	owner:Address;authority_address:Address;registry_source_sha256:str;adjudicator_address:Address;vault_address:Address;challenge_history:TreeMap[str,Challenge];milestones:TreeMap[u256,Milestone];submissions:TreeMap[str,Submission];reviews:TreeMap[u256,Review];milestone_by_reference:TreeMap[str,u256];next_milestone_id:u256;milestone_count:u256
	def __init__(self,authority_address:str,registry_source_sha256:str):
		self.owner=gl.message.sender_address;self.authority_address=Address(authority_address)
		if self.authority_address==G39:G47('E14')
		self.registry_source_sha256=G48(registry_source_sha256);self.adjudicator_address=G39;self.vault_address=G39;self.next_milestone_id=u256(1);self.milestone_count=u256(0)
	def m1(self,milestone_id):
		if milestone_id not in self.milestones:G47('E15')
	def m3(self,milestone_id,version):return f'{int(milestone_id)}:{int(version)}'
	def m0(self,milestone):
		if gl.message.sender_address not in(milestone.owner,milestone.beneficiary):G47('E16')
	@gl.public.view
	def get_vault_address(self)->Address:return self.vault_address
	@gl.public.view
	def get_adjudicator_address(self)->Address:return self.adjudicator_address
	@gl.public.view
	def get_authority_address(self)->Address:return self.authority_address
	@gl.public.view
	def get_registry_source_sha256(self)->str:return self.registry_source_sha256
	@gl.public.write
	def bind_adjudicator(self,adjudicator_address:str)->None:
		if gl.message.sender_address!=self.owner:G47('E18')
		if self.adjudicator_address!=G39:G47('E19')
		b=G46(adjudicator_address)
		if b==G39:G47('E20')
		try:a=VerdictGraphMilestoneAdjudicator(b).view().registry_address()
		except Exception:G47('E21')
		if a!=gl.message.contract_address:G47('E22')
		self.adjudicator_address=b
	@gl.public.write
	def bind_vault(self,vault_address:str)->None:
		if gl.message.sender_address!=self.owner:G47('E23')
		if self.vault_address!=G39:G47('E24')
		if self.adjudicator_address==G39:G47('E25')
		a=G46(vault_address)
		if a==G39:G47('E26')
		self.vault_address=a
	@gl.public.write
	def create_milestone(self,title:str,objective:str,project_ref:str,criteria_json:str,beneficiary_address:str,principal_required:u256,beneficiary_bond_required:u256,funding_deadline:u256,submission_deadline:u256,recovery_deadline:u256,challenge_window_seconds:u256,milestone_reference:str)->u256:
		title=G37(title,G31);objective=G37(objective,G19);project_ref=G37(project_ref,G14)
		try:e=json.loads(VerdictGraphMilestoneAuthority(self.authority_address).view().get_project_snapshot(project_ref))
		except Exception:G47('E28')
		if not isinstance(e,dict)or int(e.get('version',0))!=1:G47('E29')
		milestone_reference=G37(milestone_reference,G9)
		if milestone_reference in self.milestone_by_reference:G47('E30')
		g=Address(str(e.get('sponsor',G39.as_hex)))
		if gl.message.sender_address!=g:G47('E31')
		f=G22(criteria_json);d=Address(beneficiary_address)
		if d==G39 or d==gl.message.sender_address:G47('E32')
		if int(principal_required)<=0 or int(beneficiary_bond_required)<=0:G47('E33')
		if int(principal_required)+int(beneficiary_bond_required)>G41:G47('E34')
		h=int(G49())
		if int(funding_deadline)-h<G5:G47('E35')
		if int(submission_deadline)-int(funding_deadline)<G1:G47('E36')
		if int(recovery_deadline)-int(submission_deadline)<G4:G47('E37')
		if int(recovery_deadline)-h>G0:G47('E38')
		if not G3<=int(challenge_window_seconds)<=G2:G47('E39')
		c=self.next_milestone_id;self.next_milestone_id=u256(int(c)+1);a=G33(f);b=[int(c),project_ref,milestone_reference,g.as_hex,gl.message.sender_address.as_hex,d.as_hex,title,objective,e['baseline_uri'],e['baseline_sha256'],e['baseline_mirror_uri'],e['acceptance_record_uri'],e['acceptance_record_sha256'],e['acceptance_record_mirror_uri'],e['submission_origins_json'],a,int(principal_required),int(beneficiary_bond_required),int(funding_deadline),int(submission_deadline),int(recovery_deadline),int(challenge_window_seconds)];self.milestones[c]=Milestone(project_ref,milestone_reference,gl.message.sender_address,d,title,objective,e['baseline_uri'],e['baseline_sha256'],a,e['submission_origins_json'],G40(G33(b)),principal_required,beneficiary_bond_required,funding_deadline,submission_deadline,recovery_deadline,challenge_window_seconds,G32,u256(0),'','',False,False,u256(0),'',G39,u256(0),u256(0),u256(0),False,u256(0),u256(0),u256(0),u256(0),False,'','',gl.message_raw['datetime']);self.milestone_by_reference[milestone_reference]=c;self.milestone_count=u256(int(self.milestone_count)+1);return c
	@gl.public.write
	def activate_milestone(self,milestone_id:u256)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.owner!=gl.message.sender_address:G47('E40')
		if a.status!=G32:G47('E41')
		a.status=G30
	@gl.public.write
	def register_milestone_in_vault(self,milestone_id:u256)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if gl.message.sender_address!=a.owner:G47('E42')
		if a.status!=G30:G47('E43')
		if self.vault_address==G39:G47('E44')
		cast(Any,VerdictGraphMilestoneVault(self.vault_address).emit)(on='finalized').register_milestone(milestone_id,a.owner,a.beneficiary,a.principal_required,a.beneficiary_bond_required,a.funding_deadline,a.recovery_deadline,a.terms_sha256)
	@gl.public.write
	def submit_milestone(self,milestone_id:u256,submission_uri:str,submission_sha256:str)->u256:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.beneficiary!=gl.message.sender_address:G47('E45')
		if a.status not in(G30,G7):G47('E46')
		if int(G49())>int(a.submission_deadline):G47('E47')
		submission_uri=G43(submission_uri)
		if not G6(submission_uri,a.submission_origins_json):G47('E48')
		b=u256(int(a.submission_version)+1);submission_sha256=G48(submission_sha256);self.submissions[self.m3(milestone_id,b)]=Submission(milestone_id,b,submission_uri,submission_sha256,gl.message.sender_address,G49(),gl.message_raw['datetime']);a.submission_version=b;a.submission_uri=submission_uri;a.submission_sha256=submission_sha256;a.sponsor_ready=False;a.beneficiary_ready=False;a.challenge_reason='';a.challenged_by=G39;a.challenged_at=u256(0);a.review_queued=False;a.repair_failure_code='';a.repair_observed_sha256='';a.status=G21;return b
	@gl.public.write
	def mark_milestone_ready(self,milestone_id:u256)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.status!=G21:G47('E49')
		self.m0(a)
		if gl.message.sender_address==a.owner:a.sponsor_ready=True
		if gl.message.sender_address==a.beneficiary:a.beneficiary_ready=True
	def m2(self,milestone_id,milestone,challenge_text):
		if self.adjudicator_address==G39:G47('E50')
		milestone.review_request_id=u256(int(milestone.review_request_id)+1);milestone.review_queued=True;milestone.status=G8;a=self.get_review_context(milestone_id,milestone.review_request_id)
		if str(json.loads(a)[16])!=challenge_text:G47('E75')
		cast(Any,VerdictGraphMilestoneAdjudicator(self.adjudicator_address).emit)(on='finalized').review_milestone(milestone_id,milestone.review_request_id,a);return u256(0)
	@gl.public.write
	def resolve_milestone(self,milestone_id:u256)->u256:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.status!=G21:G47('E51')
		if a.review_queued:G47('E52')
		if not(a.sponsor_ready and a.beneficiary_ready)and int(G49())<int(a.submission_deadline):G47('E53')
		if int(G49())>int(a.recovery_deadline):G47('E54')
		return self.m2(milestone_id,a,'')
	@gl.public.write
	def retry_milestone_review(self,milestone_id:u256)->None:
		self.m1(milestone_id);b=self.milestones[milestone_id]
		if b.status!=G8 or not b.review_queued:G47('E55')
		self.m0(b)
		if int(G49())>int(b.recovery_deadline):G47('E54')
		a=self.get_review_context(milestone_id,b.review_request_id);cast(Any,VerdictGraphMilestoneAdjudicator(self.adjudicator_address).emit)(on='finalized').review_milestone(milestone_id,b.review_request_id,a)
	@gl.public.write
	def challenge_milestone(self,milestone_id:u256,reason:str)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.status!=G24 or a.settlement_queued:G47('E56')
		self.m0(a)
		if int(G49())>int(a.challenge_deadline):G47('E57')
		if int(a.challenge_count)>=G34:G47('E58')
		a.challenge_reason=G37(reason,G17);a.challenged_by=gl.message.sender_address;a.challenged_at=G49();a.challenge_count=u256(int(a.challenge_count)+1);self.challenge_history[self.m3(milestone_id,a.challenge_count)]=Challenge(milestone_id,a.challenge_count,a.challenge_reason,a.challenged_by,a.challenged_at,u256(0),gl.message_raw['datetime']);a.status=G15
	@gl.public.write
	def resolve_challenge(self,milestone_id:u256)->u256:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if a.status!=G15:G47('E59')
		self.m0(a)
		if int(G49())>int(a.recovery_deadline):G47('E54')
		return self.m2(milestone_id,a,a.challenge_reason)
	@gl.public.write
	def record_review(self,milestone_id:u256,request_id:u256,review_id:u256,submission_version:u256,challenge_count:u256,result_status:str,decision:str,failed_criterion_id:u256,consequence_rule_id:u256,source_set_sha256:str,summary:str,review_sha256:str,failure_code:str,observed_sha256:str)->None:
		if gl.message.sender_address!=self.adjudicator_address:G47('E60')
		self.m1(milestone_id);b=self.milestones[milestone_id]
		if int(request_id)!=int(b.review_request_id):G47('E61')
		if b.status in(G24,G7)and(not b.review_queued):
			if result_status==G45 and review_id in self.reviews and(self.reviews[review_id].review_sha256==review_sha256):return
			if result_status==G13 and b.repair_failure_code==failure_code and(b.repair_observed_sha256==observed_sha256):return
			G47('E62')
		if result_status==G13:
			if failure_code=='' or(observed_sha256 and(not(len(observed_sha256)==64 and all((e in '0123456789abcdef' for e in observed_sha256))))):G47('E63')
			b.status=G7;b.review_queued=False;b.repair_failure_code=G37(failure_code,160);b.repair_observed_sha256=observed_sha256;return
		if result_status!=G45:G47('E64')
		if int(review_id)<=0:G47('E65')
		if int(submission_version)!=int(b.submission_version)or int(challenge_count)!=int(b.challenge_count):G47('E66')
		summary=G37(summary,G25);source_set_sha256=G48(source_set_sha256);review_sha256=G48(review_sha256);G11(decision,failed_criterion_id,consequence_rule_id,b.criteria_json);d=[int(milestone_id),int(submission_version),int(challenge_count),decision,int(failed_criterion_id),int(consequence_rule_id),source_set_sha256]
		if G40(G33(d))!=review_sha256:G47('E67')
		if review_id in self.reviews:
			c=self.reviews[review_id]
			if c.milestone_id==milestone_id and c.request_id==request_id and(c.review_sha256==review_sha256):return
			G47('E68')
		self.reviews[review_id]=Review(milestone_id,request_id,submission_version,challenge_count,decision,failed_criterion_id,consequence_rule_id,source_set_sha256,summary,review_sha256,gl.message_raw['datetime']);b.status=G24;b.review_queued=False;b.latest_review_id=review_id;b.challenge_deadline=u256(int(G49())+int(b.challenge_window_seconds));b.settlement_earliest_at=b.challenge_deadline;b.settlement_queued=False;b.settlement_attempt_count=u256(0);b.settlement_last_attempt_at=u256(0);b.repair_failure_code='';b.repair_observed_sha256=''
		if int(challenge_count)>0:
			a=self.challenge_history[self.m3(milestone_id,challenge_count)];a.resolved_review_id=review_id
	@gl.public.view
	def get_review_context(self,milestone_id:u256,request_id:u256)->str:
		self.m1(milestone_id);b=self.milestones[milestone_id]
		if b.status!=G8 or int(request_id)!=int(b.review_request_id):G47('E69')
		d=self.m3(milestone_id,b.submission_version)
		if d not in self.submissions:G47('E70')
		try:c=json.loads(VerdictGraphMilestoneAuthority(self.authority_address).view().get_project_snapshot(b.project_ref))
		except Exception:G47('E28')
		if not isinstance(c,dict)or int(c.get('version',0))!=1:G47('E71')
		a=gl.storage.copy_to_memory(self.submissions[d]);return G33([int(milestone_id),int(request_id),b.project_ref,b.title,b.objective,b.criteria_json,b.baseline_uri,b.baseline_sha256,c['baseline_mirror_uri'],c['acceptance_record_uri'],c['acceptance_record_sha256'],c['acceptance_record_mirror_uri'],int(a.version),a.uri,a.sha256,int(b.challenge_count),b.challenge_reason,b.terms_sha256,int(b.recovery_deadline)])
	@gl.public.write
	def queue_settlement(self,milestone_id:u256,expected_review_id:u256)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if self.vault_address==G39:G47('E44')
		if a.status!=G24:G47('E72')
		if expected_review_id!=a.latest_review_id or int(expected_review_id)<=0:G47('E73')
		if not a.settlement_queued and int(G49())<=int(a.settlement_earliest_at):G47('E74')
		if int(G49())>int(a.recovery_deadline):G47('E54')
		b=self.reviews[expected_review_id];a.settlement_queued=True;a.settlement_attempt_count=u256(int(a.settlement_attempt_count)+1);a.settlement_last_attempt_at=G49();cast(Any,VerdictGraphMilestoneVault(self.vault_address).emit)(on='finalized').apply_final_outcome(milestone_id,expected_review_id,a.terms_sha256,b.consequence_rule_id,b.review_sha256)
	@gl.public.write
	def recover_milestone(self,milestone_id:u256)->None:
		self.m1(milestone_id);a=self.milestones[milestone_id]
		if self.vault_address==G39:G47('E44')
		if a.status in(G26,G20):G47('E75')
		if int(G49())<=int(a.recovery_deadline):G47('E76')
		a.settlement_queued=True;a.settlement_attempt_count=u256(int(a.settlement_attempt_count)+1);a.settlement_last_attempt_at=G49();cast(Any,VerdictGraphMilestoneVault(self.vault_address).emit)(on='finalized').recover_active(milestone_id)
	@gl.public.view
	def get_milestone_count(self)->u256:return self.milestone_count
	@gl.public.view
	def get_milestone_for_reference(self,milestone_reference:str)->u256:
		milestone_reference=G37(milestone_reference,G9)
		if milestone_reference not in self.milestone_by_reference:G47('E77')
		return self.milestone_by_reference[milestone_reference]
	@gl.public.view
	def get_milestone(self,milestone_id:u256)->Milestone:
		self.m1(milestone_id);return self.milestones[milestone_id]
	@gl.public.view
	def get_submission(self,milestone_id:u256,version:u256)->Submission:
		self.m1(milestone_id);a=self.m3(milestone_id,version)
		if a not in self.submissions:G47('E78')
		return self.submissions[a]
	@gl.public.view
	def get_review(self,review_id:u256)->Review:
		if review_id not in self.reviews:G47('E79')
		return self.reviews[review_id]
	@gl.public.view
	def get_challenge(self,milestone_id:u256,challenge_number:u256)->Challenge:
		self.m1(milestone_id);a=self.m3(milestone_id,challenge_number)
		if a not in self.challenge_history:G47('E80')
		return self.challenge_history[a]
