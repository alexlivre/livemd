; Custom installer script for Markdown Reader
; Adds a page asking the user if they want to register .md as default app.

!include nsDialogs.nsh
!include LogicLib.nsh

Var SetAsDefaultCheckbox
Var SetAsDefaultState

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

  ${NSD_CreateLabel} 0 24u 100% 20u "Markdown Reader pode ser definido como leitor padrão"
  Pop $0
  SetCtlColors $0 "" "ffffff"

  ${NSD_CreateLabel} 0 56u 100% 50u "Deseja definir o Markdown Reader como aplicativo padrão para abrir arquivos Markdown (.md, .markdown)?$\r$\nVocê poderá alterar isso depois nas configurações do Windows."
  Pop $0

  ${NSD_CreateCheckbox} 0 120u 100% 20u "Sim, tornar padrão para .md e .markdown"
  Pop $SetAsDefaultCheckbox

  ${NSD_SetState} $SetAsDefaultCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function setAsDefaultPageLeave
  ${NSD_GetState} $SetAsDefaultCheckbox $SetAsDefaultState
FunctionEnd

; Register as default handler for .md
!macro registerAsDefault UN
  ${If} $SetAsDefaultState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Classes\.md" "" "MarkdownReader.mdfile"
    WriteRegStr HKCU "Software\Classes\.markdown" "" "MarkdownReader.mdfile"
    WriteRegStr HKCU "Software\Classes\.mdown" "" "MarkdownReader.mdfile"
    WriteRegStr HKCU "Software\Classes\.mkd" "" "MarkdownReader.mdfile"

    WriteRegStr HKCU "Software\Classes\MarkdownReader.mdfile" "" "Markdown Document"
    WriteRegStr HKCU "Software\Classes\MarkdownReader.mdfile\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
    WriteRegStr HKCU "Software\Classes\MarkdownReader.mdfile\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

    ; Notify shell of change
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend

; Register on install
!macro customInstall
  !insertmacro registerAsDefault ""
!macroend

; Unregister on uninstall
!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\.md"
  DeleteRegKey HKCU "Software\Classes\.markdown"
  DeleteRegKey HKCU "Software\Classes\.mdown"
  DeleteRegKey HKCU "Software\Classes\.mkd"
  DeleteRegKey HKCU "Software\Classes\MarkdownReader.mdfile"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend