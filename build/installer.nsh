; Custom installer script for LiveMD
; Adds a page asking the user if they want to register .md as default app.
; When Windows already has a user-chosen default app for .md (UserChoice),
; the class-level registration is ignored by the shell, so the page shows
; instructions instead of a misleading checkbox (Windows 10/11 policy:
; the final decision is always made by the user).

!include nsDialogs.nsh
!include LogicLib.nsh

Var SetAsDefaultCheckbox
Var SetAsDefaultState
Var SetAsDefaultConflict
Var SetAsDefaultLabel

; Custom page BEFORE the install dir page
Page custom setAsDefaultPageCreate setAsDefaultPageLeave

Function setAsDefaultPageCreate
  ; MUI.nsh can't be used inside Page custom functions in this context.
  ; Render header manually using labels.

  nsDialogs::Create 1018
  Pop $0
  SetCtlColors $0 "" "ffffff"

  ${NSD_CreateLabel} 0 0 100% 20u "Aplicativo padrão"
  Pop $0
  SetCtlColors $0 "" "ffffff"

  ${NSD_CreateLabel} 0 24u 100% 20u "LiveMD pode ser definido como leitor padrão"
  Pop $0
  SetCtlColors $0 "" "ffffff"

  ; Detect whether Windows already has a user-chosen default app for .md.
  ; If UserChoice exists and points elsewhere, the class default we write is
  ; ignored by Explorer — so we instruct the user instead.
  StrCpy $SetAsDefaultConflict 0
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice" "ProgId"
  IfErrors setAsDefaultNoConflict
  StrCmp $0 "" setAsDefaultNoConflict
  StrCmp $0 "LiveMD.mdfile" setAsDefaultNoConflict
  StrCpy $SetAsDefaultConflict 1
setAsDefaultNoConflict:

  ${NSD_CreateLabel} 0 56u 100% 60u ""
  Pop $SetAsDefaultLabel
  SetCtlColors $SetAsDefaultLabel "" "ffffff"

  ${NSD_CreateCheckbox} 0 126u 100% 20u "Sim, tornar padrão para .md e .markdown"
  Pop $SetAsDefaultCheckbox

  ${If} $SetAsDefaultConflict == 1
    ; Windows already routes .md to another app via UserChoice. Hide the
    ; checkbox (the class-level default would be silently ignored) and show
    ; the manual steps instead.
    ShowWindow $SetAsDefaultCheckbox 0
    ${NSD_SetState} $SetAsDefaultCheckbox ${BST_UNCHECKED}
    ${NSD_SetText} $SetAsDefaultLabel "O Windows já usa outro aplicativo padrão para arquivos .md.$\r$\nPara abrir com o LiveMD, após a instalação:$\r$\n$\r$\n1. Clique com o botão direito em um arquivo .md$\r$\n2. Abrir com → LiveMD$\r$\n3. Marque “Sempre usar este app”"
  ${Else}
    ${NSD_SetText} $SetAsDefaultLabel "Deseja definir o LiveMD como aplicativo padrão para abrir arquivos Markdown (.md, .markdown)?$\r$\nVocê poderá alterar isso depois nas configurações do Windows."
    ${NSD_SetState} $SetAsDefaultCheckbox ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function setAsDefaultPageLeave
  ${NSD_GetState} $SetAsDefaultCheckbox $SetAsDefaultState
FunctionEnd

; Registers LiveMD as an available handler for Markdown files. Runs on every
; install so the app always appears in the "Open with" menu.
!macro registerHandler UN
  WriteRegStr HKCU "Software\Classes\LiveMD.mdfile" "" "Markdown Document"
  WriteRegStr HKCU "Software\Classes\LiveMD.mdfile\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\LiveMD.mdfile\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Makes the app show up in "Open with" even when another default is chosen.
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  ; Offer LiveMD as a candidate ProgID for each Markdown extension.
  WriteRegStr HKCU "Software\Classes\.md\OpenWithProgids" "LiveMD.mdfile" ""
  WriteRegStr HKCU "Software\Classes\.markdown\OpenWithProgids" "LiveMD.mdfile" ""
  WriteRegStr HKCU "Software\Classes\.mdown\OpenWithProgids" "LiveMD.mdfile" ""
  WriteRegStr HKCU "Software\Classes\.mkd\OpenWithProgids" "LiveMD.mdfile" ""
!macroend

; Claim the class-level default only when the user opted in and there is no
; conflicting UserChoice (the shell would ignore it anyway).
!macro registerAsDefault UN
  ${If} $SetAsDefaultState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\.md" "" "LiveMD.mdfile"
    WriteRegStr HKCU "Software\Classes\.markdown" "" "LiveMD.mdfile"
    WriteRegStr HKCU "Software\Classes\.mdown" "" "LiveMD.mdfile"
    WriteRegStr HKCU "Software\Classes\.mkd" "" "LiveMD.mdfile"

    ; Notify shell of change
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend

; Register on install
!macro customInstall
  !insertmacro registerHandler ""
  !insertmacro registerAsDefault ""
!macroend

; Unregister on uninstall
!macro customUnInstall
  DeleteRegValue HKCU "Software\Classes\.md\OpenWithProgids" "LiveMD.mdfile"
  DeleteRegValue HKCU "Software\Classes\.markdown\OpenWithProgids" "LiveMD.mdfile"
  DeleteRegValue HKCU "Software\Classes\.mdown\OpenWithProgids" "LiveMD.mdfile"
  DeleteRegValue HKCU "Software\Classes\.mkd\OpenWithProgids" "LiveMD.mdfile"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCU "Software\Classes\LiveMD.mdfile"
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\.mdown"
  DeleteRegKey HKCU "Software\Classes\.mkd"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
