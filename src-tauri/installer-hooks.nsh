; "Open in TauCode" shell verbs for folders, folder backgrounds, and drives.
; HKCU matches installer currentUser scope. %V = clicked path.
; NoWorkingDirectory keeps Explorer from overriding %V (System32 on Drive).

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTauCode" "" "Open in TauCode"
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTauCode" "Icon" '"$INSTDIR\TauCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTauCode" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\shell\OpenInTauCode\command" "" '"$INSTDIR\TauCode.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTauCode" "" "Open in TauCode"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTauCode" "Icon" '"$INSTDIR\TauCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTauCode" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\OpenInTauCode\command" "" '"$INSTDIR\TauCode.exe" "%V"'

  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTauCode" "" "Open in TauCode"
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTauCode" "Icon" '"$INSTDIR\TauCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTauCode" "NoWorkingDirectory" ""
  WriteRegStr HKCU "Software\Classes\Drive\shell\OpenInTauCode\command" "" '"$INSTDIR\TauCode.exe" "%V"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\OpenInTauCode"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\OpenInTauCode"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\OpenInTauCode"
!macroend
