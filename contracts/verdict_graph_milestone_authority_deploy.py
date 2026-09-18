# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from dataclasses import dataclass
from datetime import datetime,timezone
import hashlib
import json
from typing import NoReturn
from genlayer import*
G5=Address('0x0000000000000000000000000000000000000000')
G0=160
G3=768
G2=64
def G8(message:str)->NoReturn:raise gl.vm.UserError(message)
def G1(value)->str:return json.dumps(value,sort_keys=True,separators=(',',':'))
def G9(a:str,label:str)->str:
	a=a.strip()
	if len(a)!=G2 or not all((b in '0123456789abcdef' for b in a)):G8(f'{label} must be 64 lowercase hexadecimal characters')
	return a
def G4(a:str,label:str,maximum:int)->str:
	a=a.strip()
	if not a or len(a)>maximum:G8(f'{label} is empty or too long')
	return a
def G7(c:str,label:str)->str:
	c=G4(c,label,G3)
	if not c.startswith('https://')or len(c)<=len('https://')or any((d.isspace()for d in c)):G8(f'{label} must use HTTPS')
	a=c[len('https://'):].split('/',1)[0].split('?',1)[0].split('#',1)[0];b=a.lower().split('.')
	if not a or '@' in a or ':' in a or any((d in a for d in '\\%<>')):G8(f'{label} must use a public HTTPS origin')
	if len(b)==4 and all((e.isdigit()for e in b))and all((0<=int(e)<=255 for e in b)):G8(f'{label} must use a public HTTPS origin')
	if len(b)<2 or any((not e or e[0]=='-' or e[-1]=='-' or(not all((d.isascii()and(d.isalnum()or d=='-')for d in e)))for e in b)):G8(f'{label} must use a public HTTPS origin')
	if a.lower()in('localhost','localhost.localdomain')or a.lower().endswith('.local'):G8(f'{label} must use a public HTTPS origin')
	return c
def G6(value:str)->str:
	a=value[len('https://'):].split('/',1)[0].split('?',1)[0].split('#',1)[0];return f'https://{a.lower()}'
@allow_storage
@dataclass
class AcceptedProject:
	project_ref:str;sponsor:Address;baseline_uri:str;baseline_sha256:str;baseline_mirror_uri:str;acceptance_record_uri:str;acceptance_record_sha256:str;acceptance_record_mirror_uri:str;submission_origins_json:str;registered_at:str
class VerdictGraphMilestoneAuthority(gl.Contract):
	owner:Address;acceptance_authority:Address;authority_source_sha256:str;accepted_projects:TreeMap[str,AcceptedProject];project_count:u256
	def __init__(self,acceptance_authority_address:str,authority_source_sha256:str):
		self.owner=gl.message.sender_address;self.acceptance_authority=Address(acceptance_authority_address)
		if self.acceptance_authority==G5:G8('Acceptance authority cannot be the zero address')
		self.authority_source_sha256=G9(authority_source_sha256,'Authority source SHA-256');self.project_count=u256(0)
	@gl.public.view
	def get_owner(self)->Address:return self.owner
	@gl.public.view
	def get_acceptance_authority(self)->Address:return self.acceptance_authority
	@gl.public.view
	def get_authority_source_sha256(self)->str:return self.authority_source_sha256
	@gl.public.view
	def get_controller_source_sha256(self)->str:return self.authority_source_sha256
	@gl.public.view
	def get_project_count(self)->u256:return self.project_count
	@gl.public.write
	def register_accepted_project(self,project_ref:str,sponsor_address:str,baseline_uri:str,baseline_sha256:str,baseline_mirror_uri:str,acceptance_record_uri:str,acceptance_record_sha256:str,acceptance_record_mirror_uri:str)->None:
		if gl.message.sender_address!=self.acceptance_authority:G8('Only the acceptance authority can register a project')
		project_ref=G4(project_ref,'Accepted project reference',G0)
		if project_ref in self.accepted_projects:G8('Accepted project reference is already registered')
		b=Address(sponsor_address)
		if b==G5:G8('Accepted project sponsor cannot be the zero address')
		baseline_uri=G7(baseline_uri,'Accepted baseline URI');baseline_mirror_uri=G7(baseline_mirror_uri,'Accepted baseline mirror URI');acceptance_record_uri=G7(acceptance_record_uri,'Acceptance record URI');acceptance_record_mirror_uri=G7(acceptance_record_mirror_uri,'Acceptance record mirror URI')
		if baseline_mirror_uri==baseline_uri:G8('Accepted baseline mirror must be a distinct URI')
		if acceptance_record_mirror_uri==acceptance_record_uri:G8('Acceptance record mirror must be a distinct URI')
		a=G1(sorted({G6(baseline_uri),G6(baseline_mirror_uri),G6(acceptance_record_uri),G6(acceptance_record_mirror_uri)}));self.accepted_projects[project_ref]=AcceptedProject(project_ref=project_ref,sponsor=b,baseline_uri=baseline_uri,baseline_sha256=G9(baseline_sha256,'Accepted baseline SHA-256'),baseline_mirror_uri=baseline_mirror_uri,acceptance_record_uri=acceptance_record_uri,acceptance_record_sha256=G9(acceptance_record_sha256,'Acceptance record SHA-256'),acceptance_record_mirror_uri=acceptance_record_mirror_uri,submission_origins_json=a,registered_at=gl.message_raw['datetime']);self.project_count=u256(int(self.project_count)+1)
	@gl.public.view
	def get_accepted_project(self,project_ref:str)->AcceptedProject:
		project_ref=G4(project_ref,'Accepted project reference',G0)
		if project_ref not in self.accepted_projects:G8('Unknown accepted project')
		return self.accepted_projects[project_ref]
	@gl.public.view
	def get_project_snapshot(self,project_ref:str)->str:
		a=self.get_accepted_project(project_ref);return G1({'version':1,'project_ref':a.project_ref,'sponsor':a.sponsor.as_hex,'baseline_uri':a.baseline_uri,'baseline_sha256':a.baseline_sha256,'baseline_mirror_uri':a.baseline_mirror_uri,'acceptance_record_uri':a.acceptance_record_uri,'acceptance_record_sha256':a.acceptance_record_sha256,'acceptance_record_mirror_uri':a.acceptance_record_mirror_uri,'submission_origins_json':a.submission_origins_json,'registered_at':a.registered_at})
