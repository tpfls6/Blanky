$ErrorActionPreference = 'Stop'
$base = 'C:\Users\serin\Github\Blanky\application_work'
$hwp = New-Object -ComObject HWPFrame.HwpObject
$hwp.XHwpWindows.Item(0).Visible = $false
$hwp.SetMessageBoxMode(0x00010000) | Out-Null
try {
  $ok = $hwp.Open("$base\filled.hwpx",'HWPX','forceopen:true')
  if (!$ok) { throw 'Open failed' }
  $hwp.HAction.Run('MoveDocBegin') | Out-Null
  $find = $hwp.HParameterSet.HFindReplace
  $hwp.HAction.GetDefault('RepeatFind',$find.HSet) | Out-Null
  $find.FindString = '[IRIS_IMAGE]'
  $find.Direction = 0
  $find.IgnoreMessage = 1
  $find.FindType = 1
  if ($hwp.HAction.Execute('RepeatFind',$find.HSet)) {
    $hwp.HAction.Run('Delete') | Out-Null
    $pic = $hwp.InsertPicture("$base\image2.png",$true,1,$false,$false,0,160,100)
  }
  $hwp.SaveAs("$base\캡스톤_사업화지원_신청서_IRIS_완성.hwp",'HWP','') | Out-Null
  $hwp.SaveAs("$base\최종검토.pdf",'PDF','') | Out-Null
  $hwp.GetTextFile('TEXT','') | Set-Content -LiteralPath "$base\final_text.txt" -Encoding utf8
  Write-Output "Pages: $($hwp.PageCount)"
  Write-Output 'Saved HWP and review PDF'
} finally { $hwp.Quit() }
