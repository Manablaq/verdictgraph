"""Stage 4E split-architecture Direct Mode entrypoint.

The pinned Direct runner supports one Intelligent Contract class per Python
process. Executable split tests therefore live in test_split_registry.py and
test_split_adjudicator.py and are launched in separate processes by
scripts/mac_stage4e_split_architecture_verify.sh.
"""
