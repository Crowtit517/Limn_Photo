const menuDefinition = [
	{
		"name": "File",
		"children": [
			{
				"name": "New",
				"shortcut": "Ctrl+N",
				"target": "file/new.new"
			},
			{
				"divider": true
			},
			{
				"name": "Open",
				"children": [
					{
						"name": "Open File",
						"ellipsis": true,
						"shortcut": "Ctrl+O",
						"target": "file/open.open_file"
					},
			{
				"name": "최근 파일 열기",
				"ellipsis": true,
				"target": "file/recent.recent"
			},
			{
				"name": "닫기",
				"shortcut": "Ctrl+W",
				"target": "file/recent.close"
			},
			{
				"name": "자동화",
				"children": [
					{
						"name": "일괄 처리",
						"ellipsis": true,
						"target": "file/batch.batch"
					}
				]
			},
					{
						"name": "Open Directory",
						"ellipsis": true,
						"target": "file/open.open_dir"
					},
					{
						"name": "Open from Webcam",
						"target": "file/open.open_webcam"
					},
					{
						"name": "Open URL",
						"ellipsis": true,
						"target": "file/open.open_url"
					},
					{
						"name": "Open Data URL",
						"ellipsis": true,
						"target": "file/open.open_data_url"
					},
					{
						"name": "Open Test Template",
						"target": "file/open.open_template_test"
					}
				]
			},
			{
				"name": "Search Images",
				"ellipsis": true,
				"target": "file/open.search"
			},
			{
				"divider": true
			},
			{
				"name": "Export",
				"ellipsis": true,
				"shortcut": "Ctrl+Alt+Shift+S",
				"target": "file/save.export"
			},
			{
				"name": "16비트 PNG로 내보내기",
				"target": "file/hd_io.export_png16"
			},
			{
				"name": "Save As",
				"ellipsis": true,
				"shortcut": "Ctrl+Shift+S",
				"target": "file/save.save"
			},
			{
				"name": "저장",
				"shortcut": "Ctrl+S",
				"target": "file/psd.save"
			},
			{
				"name": "Save As Data URL",
				"ellipsis": true,
				"target": "file/save.save_data_url"
			},
			{
				"name": "Print",
				"ellipsis": true,
				"shortcut": "Ctrl+P",
				"target": "file/print.print"
			},
			{
				"divider": true
			},
			{
				"name": "Quick Save",
				"shortcut": "F9",
				"target": "file/quicksave.quicksave"
			},
			{
				"name": "Quick Load",
				"shortcut": "F10",
				"target": "file/quickload.quickload"
			}
		]
	},
	{
		"name": "Edit",
		"children": [
			{
				"name": "Undo",
				"shortcut": "Ctrl+Z",
				"target": "edit/undo.undo"
			},
			{
				"name": "Redo",
				"shortcut": "Ctrl+Shift+Z",
				"target": "edit/redo.redo"
			},
			{
				"divider": true
			},
			{
				"name": "지우기",
				"shortcut": "Del",
				"target": "select/select.clear"
			},
			{
				"name": "복사한 레이어",
				"shortcut": "Ctrl+J",
				"target": "select/select.layer_via_copy"
			},
			{
				"name": "잘라내기",
				"shortcut": "Ctrl+X",
				"target": "select/select.cut"
			},
			{
				"name": "복사",
				"shortcut": "Ctrl+C",
				"target": "edit/copy.copy_to_clipboard"
			},
			{
				"name": "Paste",
				"shortcut": "Ctrl+V",
				"target": "edit/paste.paste"
			},
			{
				"divider": true
			},
			{
				"name": "칠",
				"shortcut": "Shift+F5",
				"target": "select/select.fill_foreground"
			},
			{
				"name": "내용 인식 채우기",
				"target": "select/select.content_aware_fill"
			},
			{
				"divider": true
			},
			{
				"name": "내용 인식 비율",
				"shortcut": "Alt+Shift+Ctrl+C",
				"target": "edit/content_aware_scale.content_aware_scale"
			},
			{
				"name": "자유 변형",
				"shortcut": "Ctrl+T",
				"target": "edit/transform.free_transform"
			},
			{
				"name": "변형",
				"children": [
					{
						"name": "기울이기",
						"target": "edit/transform.skew"
					},
					{
						"name": "왜곡",
						"target": "edit/transform.distort"
					},
					{
						"name": "원근",
						"target": "edit/transform.perspective"
					},
					{
						"name": "뒤틀기",
						"target": "edit/transform.warp"
					},
					{
						"divider": true
					},
					{
						"name": "180° 회전",
						"target": "edit/transform.rotate_180"
					},
					{
						"name": "90° 시계 방향 회전",
						"target": "edit/transform.rotate_cw"
					},
					{
						"name": "90° 시계 반대 방향 회전",
						"target": "edit/transform.rotate_ccw"
					},
					{
						"divider": true
					},
					{
						"name": "가로로 뒤집기",
						"target": "edit/transform.flip_horizontal"
					},
					{
						"name": "세로로 뒤집기",
						"target": "edit/transform.flip_vertical"
					}
				]
			}
		]
	},
	{
		"name": "Image",
		"children": [
			{
				"name": "Information",
				"ellipsis": true,
				"target": "image/information.information"
			},
			{
				"name": "Canvas Size",
				"ellipsis": true,
				"shortcut": "Ctrl+Alt+C",
				"target": "image/size.size"
			},
			{
				"name": "자르기",
				"target": "select/select.crop"
			},
			{
				"name": "Trim",
				"ellipsis": true,
				"target": "image/trim.trim"
			},
			{
				"divider": true
			},
			{
				"name": "이미지 크기",
				"ellipsis": true,
				"shortcut": "Ctrl+Alt+I",
				"target": "image/resize.resize"
			},
			{
				"name": "이미지 회전",
				"ellipsis": true,
				"target": "image/rotate.rotate"
			},
			{
				"name": "캔버스 뒤집기",
				"children": [
					{
						"name": "캔버스 세로로 뒤집기",
						"target": "image/flip.vertical"
					},
					{
						"name": "캔버스 가로로 뒤집기",
						"target": "image/flip.horizontal"
					}
				]
			},
			{
				"name": "Translate",
				"ellipsis": true,
				"target": "image/translate.translate"
			},
			{
				"name": "Opacity",
				"ellipsis": true,
				"target": "image/opacity.opacity"
			},
			{
				"divider": true
			},
			{
				"name": "모드",
				"children": [
					{
						"name": "8비트/채널",
						"target": "image/mode.to_8bit"
					},
					{
						"name": "16비트/채널",
						"target": "image/mode.to_16bit"
					}
				]
			},
			{
				"name": "조정",
				"children": [
					{
						"name": "명도/대비",
						"ellipsis": true,
						"target": "image/adjust.brightness_contrast"
					},
					{
						"name": "레벨",
						"ellipsis": true,
						"shortcut": "Ctrl+L",
						"target": "image/adjust.levels"
					},
					{
						"name": "곡선",
						"ellipsis": true,
						"shortcut": "Ctrl+M",
						"target": "image/adjust.curves"
					},
					{
						"divider": true
					},
					{
						"name": "색조/채도",
						"ellipsis": true,
						"shortcut": "Ctrl+U",
						"target": "image/adjust.hue_saturation"
					},
					{
						"name": "노출",
						"ellipsis": true,
						"target": "image/adjust.exposure"
					},
					{
						"name": "활기",
						"ellipsis": true,
						"target": "image/adjust.vibrance"
					},
					{
						"name": "색상 균형",
						"ellipsis": true,
						"shortcut": "Ctrl+B",
						"target": "image/adjust.color_balance"
					},
					{
						"name": "포토 필터",
						"ellipsis": true,
						"target": "image/adjust.photo_filter"
					},
					{
						"name": "채널 혼합",
						"ellipsis": true,
						"target": "image/adjust.channel_mixer"
					},
					{
						"name": "어두운 영역/밝은 영역",
						"ellipsis": true,
						"target": "image/adjust.shadows_highlights"
					},
					{
						"name": "선택 색상",
						"ellipsis": true,
						"target": "image/adjust.selective_color"
					},
					{
						"name": "그레이디언트 맵",
						"ellipsis": true,
						"target": "image/adjust.gradient_map"
					},
					{
						"name": "색상 검색",
						"ellipsis": true,
						"target": "image/adjust.color_lookup"
					}
				]
			},
			{
				"name": "기울기 보정",
				"ellipsis": true,
				"target": "image/straighten.straighten"
			},
			{
				"name": "Color Corrections",
				"ellipsis": true,
				"target": "image/color_corrections.color_corrections"
			},
			{
				"name": "Auto Adjust Colors",
				"shortcut": "Ctrl+Shift+L",
				"target": "image/auto_adjust.auto_adjust"
			},
			{
				"name": "Decrease Color Depth",
				"target": "image/decrease_colors.decrease_colors"
			},
			{
				"name": "Color Palette",
				"ellipsis": true,
				"target": "image/palette.palette"
			},
			{
				"divider": true
			},
			{
				"name": "Histogram",
				"ellipsis": true,
				"target": "image/histogram.histogram"
			}
		]
	},
	{
		"name": "Layer",
		"children": [
			{
				"name": "New",
				"shortcut": "Ctrl+Shift+N",
				"target": "layer/new.new"
			},
			{
				"name": "New from Selection",
				"target": "layer/new.new_selection"
			},
			{
				"name": "새 그룹",
				"target": "layer/group.new_group"
			},
			{
				"name": "레이어 그룹화",
				"shortcut": "Ctrl+G",
				"target": "layer/group.group"
			},
			{
				"name": "레이어 그룹 해제",
				"shortcut": "Shift+Ctrl+G",
				"target": "layer/group.ungroup"
			},
			{
				"name": "레이어 스타일",
				"children": [
					{
						"name": "혼합 옵션",
						"ellipsis": true,
						"target": "layer/styles.blending_options"
					},
					{
						"name": "드롭 섀도",
						"ellipsis": true,
						"target": "layer/styles.drop_shadow"
					},
					{
						"name": "획",
						"ellipsis": true,
						"target": "layer/styles.stroke"
					},
					{
						"name": "외부 광선",
						"ellipsis": true,
						"target": "layer/styles.outer_glow"
					},
					{
						"name": "색상 오버레이",
						"ellipsis": true,
						"target": "layer/styles.color_overlay"
					},
					{
						"divider": true
					},
					{
						"name": "레이어 스타일 지우기",
						"target": "layer/styles.clear"
					}
				]
			},
			{
				"name": "스마트 오브젝트",
				"children": [
					{
						"name": "스마트 오브젝트로 변환",
						"target": "layer/smart.convert"
					},
					{
						"name": "스마트 오브젝트 래스터화",
						"target": "layer/smart.rasterize"
					}
				]
			},
			{
				"name": "편집 가능한 모양 레이어로 변환",
				"target": "layer/extras.convert_shape"
			},
			{
				"name": "도장 찍기 (보이는 레이어 병합)",
				"shortcut": "Ctrl+Alt+Shift+E",
				"target": "layer/extras.stamp_visible"
			},
			{
				"name": "새 조정 레이어",
				"children": [
					{
						"name": "명도/대비",
						"ellipsis": true,
						"target": "layer/adjustment.brightness_contrast"
					},
					{
						"name": "레벨",
						"ellipsis": true,
						"target": "layer/adjustment.levels"
					},
					{
						"name": "곡선",
						"ellipsis": true,
						"target": "layer/adjustment.curves"
					},
					{
						"divider": true
					},
					{
						"name": "색조/채도",
						"ellipsis": true,
						"target": "layer/adjustment.hue_saturation"
					},
					{
						"name": "흑백",
						"target": "layer/adjustment.black_white"
					},
					{
						"name": "노출",
						"ellipsis": true,
						"target": "layer/adjustment.exposure"
					},
					{
						"name": "활기",
						"ellipsis": true,
						"target": "layer/adjustment.vibrance"
					},
					{
						"name": "색상 균형",
						"ellipsis": true,
						"target": "layer/adjustment.color_balance"
					},
					{
						"name": "포토 필터",
						"ellipsis": true,
						"target": "layer/adjustment.photo_filter"
					},
					{
						"name": "채널 혼합",
						"ellipsis": true,
						"target": "layer/adjustment.channel_mixer"
					},
					{
						"name": "선택 색상",
						"ellipsis": true,
						"target": "layer/adjustment.selective_color"
					},
					{
						"name": "그레이디언트 맵",
						"ellipsis": true,
						"target": "layer/adjustment.gradient_map"
					},
					{
						"name": "색상 검색",
						"ellipsis": true,
						"target": "layer/adjustment.color_lookup"
					},
					{
						"divider": true
					},
					{
						"name": "반전",
						"target": "layer/adjustment.invert"
					}
				]
			},
			{
				"name": "조정 레이어 설정 편집",
				"target": "layer/adjustment.edit"
			},
			{
				"divider": true
			},
			{
				"name": "레이어 복제",
				"shortcut": "Ctrl+J",
				"target": "layer/duplicate.duplicate"
			},
			{
				"name": "레이어 숨기기",
				"target": "layer/visibility.toggle"
			},
			{
				"name": "Delete",
				"target": "layer/delete.delete"
			},
			{
				"name": "Convert to Raster",
				"target": "layer/raster.raster"
			},
			{
				"divider": true
			},
			{
				"name": "정돈",
				"children": [
					{
						"name": "앞으로 가져오기",
						"target": "layer/move.up"
					},
					{
						"name": "뒤로 보내기",
						"target": "layer/move.down"
					}
				]
			},
			{
				"name": "레이어 마스크",
				"children": [
					{
						"name": "모두 나타내기",
						"target": "layer/mask.reveal_all"
					},
					{
						"name": "모두 숨기기",
						"target": "layer/mask.hide_all"
					},
					{
						"divider": true
					},
					{
						"name": "마스크 반전",
						"target": "layer/mask.invert"
					},
					{
						"name": "마스크 사용/사용 안 함",
						"target": "layer/mask.toggle"
					},
					{
						"name": "마스크 적용",
						"target": "layer/mask.apply"
					},
					{
						"name": "마스크 삭제",
						"target": "layer/mask.remove"
					}
				]
			},
			{
				"name": "혼합 모드",
				"ellipsis": true,
				"target": "layer/composition.composition"
			},
			{
				"name": "레이어 이름 바꾸기",
				"ellipsis": true,
				"target": "layer/rename.rename"
			},
			{
				"name": "Clear",
				"target": "layer/clear.clear"
			},
			{
				"divider": true
			},
			{
				"name": "Differences Down",
				"target": "layer/differences.differences"
			},
			{
				"name": "Merge Down",
				"shortcut": "Ctrl+E",
				"target": "layer/merge.merge"
			},
			{
				"name": "Flatten Image",
				"shortcut": "Ctrl+Shift+E",
				"target": "layer/flatten.flatten"
			}
		]
	},
	{
		"name": "문자",
		"children": [
			{
				"name": "패널",
				"children": [
					{
						"name": "문자 패널",
						"target": "window/workspace.toggle_character"
					},
					{
						"name": "단락 패널",
						"target": "window/workspace.toggle_paragraph"
					}
				]
			},
			{
				"name": "텍스트 뒤틀기",
				"ellipsis": true,
				"target": "select/channels.warp_text"
			},
			{
				"name": "문자 레이어 래스터화",
				"target": "layer/raster.raster"
			}
		]
	},
	{
		"name": "선택",
		"children": [
			{
				"name": "모두",
				"shortcut": "Ctrl+A",
				"target": "select/select.all"
			},
			{
				"name": "선택 해제",
				"shortcut": "Ctrl+D",
				"target": "select/select.deselect"
			},
			{
				"name": "다시 선택",
				"shortcut": "Ctrl+Shift+D",
				"target": "select/select.reselect"
			},
			{
				"name": "반전",
				"shortcut": "Ctrl+Shift+I",
				"target": "select/select.inverse"
			},
			{
				"divider": true
			},
			{
				"name": "피사체",
				"target": "select/subject.subject"
			},
			{
				"name": "선택 및 마스크",
				"ellipsis": true,
				"shortcut": "Alt+Ctrl+R",
				"target": "select/subject.select_and_mask"
			},
			{
				"name": "하늘",
				"target": "select/color_range.sky"
			},
			{
				"name": "색상 범위",
				"ellipsis": true,
				"target": "select/color_range.color_range"
			},
			{
				"name": "선택 영역 저장",
				"ellipsis": true,
				"target": "select/channels.save"
			},
			{
				"divider": true
			},
			{
				"name": "수정",
				"children": [
					{
						"name": "페더",
						"shortcut": "Shift+F6",
						"ellipsis": true,
						"target": "select/select.feather"
					},
					{
						"name": "확대",
						"ellipsis": true,
						"target": "select/select.expand"
					},
					{
						"name": "축소",
						"ellipsis": true,
						"target": "select/select.contract"
					}
				]
			},
			{
				"divider": true
			},
			{
				"name": "선택 영역을 새 레이어로 잘라내기",
				"shortcut": "Ctrl+Shift+J",
				"target": "select/select.layer_via_cut"
			}
		]
	},
	{
		"name": "필터",
		"children": [
			{
				"name": "Camera Raw 필터",
				"ellipsis": true,
				"shortcut": "Shift+Ctrl+A",
				"target": "image/camera_raw.camera_raw"
			},
			{
				"name": "픽셀 유동화",
				"ellipsis": true,
				"shortcut": "Shift+Ctrl+X",
				"target": "image/liquify.liquify"
			},
			{
				"divider": true
			},
			{
				"name": "흐림 효과",
				"children": [
					{
						"name": "가우시안 흐림 효과",
						"ellipsis": true,
						"target": "image/filters.gaussian_blur"
					}
				]
			},
			{
				"name": "노이즈",
				"children": [
					{
						"name": "AI 노이즈 감소",
						"ellipsis": true,
						"target": "image/ai_denoise.ai_denoise"
					}
				]
			},
			{
				"name": "흐림 효과 갤러리",
				"children": [
					{
						"name": "조리개 흐림 효과",
						"ellipsis": true,
						"target": "image/filters.iris_blur"
					},
					{
						"name": "기울기-이동",
						"ellipsis": true,
						"target": "image/filters.tilt_shift"
					}
				]
			},
			{
				"name": "선명 효과",
				"children": [
					{
						"name": "고급 선명 효과",
						"ellipsis": true,
						"target": "image/filters.smart_sharpen"
					},
					{
						"name": "언샵 마스크",
						"ellipsis": true,
						"target": "image/filters.unsharp_mask"
					}
				]
			},
			{
				"name": "기타",
				"children": [
					{
						"name": "하이 패스",
						"ellipsis": true,
						"target": "image/filters.high_pass"
					}
				]
			},
			{
				"name": "픽셀 유동화 - 부풀리기/오그리기 도구",
				"target": "tools/activate_tool.activate",
				"parameter": "bulge_pinch"
			},
			{
				"divider": true
			},
			{
				"name": "Effect browser",
				"ellipsis": true,
				"target": "effects/browser.browser"
			},
			{
				"divider": true
			},
			{
				"name": "Common Filters",
				"children": [
					{
						"name": "Gaussian Blur",
						"ellipsis": true,
						"target": "effects/common/blur.blur"
					},
					{
						"name": "Brightness",
						"ellipsis": true,
						"target": "effects/common/brightness.brightness"
					},
					{
						"name": "Contrast",
						"ellipsis": true,
						"target": "effects/common/contrast.contrast"
					},
					{
						"name": "Grayscale",
						"ellipsis": true,
						"target": "effects/common/grayscale.grayscale"
					},
					{
						"name": "Hue Rotate",
						"ellipsis": true,
						"target": "effects/common/hue-rotate.hue_rotate"
					},
					{
						"name": "Negative",
						"ellipsis": true,
						"target": "effects/common/invert.invert"
					},
					{
						"name": "Saturate",
						"ellipsis": true,
						"target": "effects/common/saturate.saturate"
					},
					{
						"name": "Sepia",
						"ellipsis": true,
						"target": "effects/common/sepia.sepia"
					},
					{
						"name": "Shadow",
						"ellipsis": true,
						"target": "effects/common/shadow.shadow"
					}
				]
			},
			{
				"name": "Instagram Filters",
				"children": [
					{
						"name": "1977",
						"target": "effects/instagram/1977.1977"
					},
					{
						"name": "Aden",
						"target": "effects/instagram/aden.aden"
					},
					{
						"name": "Clarendon",
						"target": "effects/instagram/clarendon.clarendon"
					},
					{
						"name": "Gingham",
						"target": "effects/instagram/gingham.gingham"
					},
					{
						"name": "Inkwell",
						"target": "effects/instagram/inkwell.inkwell"
					},
					{
						"name": "Lo-fi",
						"target": "effects/instagram/lofi.lofi"
					},
					{
						"name": "Toaster",
						"target": "effects/instagram/toaster.toaster"
					},
					{
						"name": "Valencia",
						"target": "effects/instagram/valencia.valencia"
					},
					{
						"name": "X-Pro II",
						"target": "effects/instagram/xpro2.xpro2"
					}
				]
			},
			{
				"name": "Black and White",
				"ellipsis": true,
				"target": "effects/black_and_white.black_and_white"
			},
			{
				"name": "Borders",
				"ellipsis": true,
				"target": "effects/borders.borders"
			},
			{
				"name": "Blueprint",
				"target": "effects/blueprint.blueprint"
			},
			{
				"name": "Box Blur",
				"ellipsis": true,
				"target": "effects/box_blur.box_blur"
			},
			{
				"name": "Denoise",
				"ellipsis": true,
				"target": "effects/denoise.denoise"
			},
			{
				"name": "Dither",
				"ellipsis": true,
				"target": "effects/dither.dither"
			},
			{
				"name": "Dot Screen",
				"ellipsis": true,
				"target": "effects/dot_screen.dot_screen"
			},
			{
				"name": "Edge",
				"target": "effects/edge.edge"
			},
			{
				"name": "Emboss",
				"target": "effects/emboss.emboss"
			},
			{
				"name": "Enrich",
				"ellipsis": true,
				"target": "effects/enrich.enrich"
			},
			{
				"name": "Grains",
				"ellipsis": true,
				"target": "effects/grains.grains"
			},
			{
				"name": "Heatmap",
				"target": "effects/heatmap.heatmap"
			},
			{
				"name": "Mosaic",
				"ellipsis": true,
				"target": "effects/mosaic.mosaic"
			},
			{
				"name": "Night Vision",
				"target": "effects/night_vision.night_vision"
			},
			{
				"name": "Oil",
				"ellipsis": true,
				"target": "effects/oil.oil"
			},
			{
				"name": "Pencil",
				"target": "effects/pencil.pencil"
			},
			{
				"name": "Sharpen",
				"ellipsis": true,
				"target": "effects/sharpen.sharpen"
			},
			{
				"name": "Solarize",
				"target": "effects/solarize.solarize"
			},
			{
				"name": "Tilt Shift",
				"ellipsis": true,
				"target": "effects/tilt_shift.tilt_shift"
			},
			{
				"name": "Vignette",
				"ellipsis": true,
				"target": "effects/vignette.vignette"
			},
			{
				"name": "Vibrance",
				"ellipsis": true,
				"target": "effects/vibrance.vibrance"
			},
			{
				"name": "Vintage",
				"ellipsis": true,
				"target": "effects/vintage.vintage"
			},
			{
				"name": "Zoom Blur",
				"ellipsis": true,
				"target": "effects/zoom_blur.zoom_blur"
			}
		]
	},
	{
		"name": "View",
		"children": [
			{
				"name": "Zoom",
				"children": [
					{
						"name": "Zoom In",
						"shortcut": "Ctrl++",
						"target": "view/zoom.in"
					},
					{
						"name": "Zoom Out",
						"shortcut": "Ctrl+-",
						"target": "view/zoom.out"
					},
					{
						"divider": true
					},
					{
						"name": "100%",
						"shortcut": "Ctrl+1",
						"target": "view/zoom.original"
					},
					{
						"name": "화면 크기에 맞게 조정",
						"shortcut": "Ctrl+0",
						"target": "view/zoom.auto"
					}
				]
			},
			{
				"name": "격자",
				"shortcut": "Ctrl+'",
				"target": "view/grid.grid"
			},
			{
				"name": "Guides",
				"children": [
					{
						"name": "Insert",
						"ellipsis": true,
						"target": "view/guides.insert"
					},
					{
						"name": "Update",
						"target": "view/guides.update"
					},
					{
						"name": "Remove all",
						"target": "view/guides.remove"
					}
				]
			},
			{
				"name": "Ruler",
				"target": "view/ruler.ruler"
			},
			{
				"divider": true
			},
			{
				"name": "Full Screen",
				"target": "view/full_screen.fs"
			}
		]
	},
	{
		"name": "Tools",
		"children": [
			{
				"name": "애니메이션 미리보기 (레이어 프레임)",
				"target": "tools/activate_tool.activate",
				"parameter": "animation"
			},
			{
				"name": "Sprites",
				"target": "tools/sprites.sprites"
			},
			{
				"name": "Key-Points",
				"target": "tools/keypoints.keypoints"
			},
			{
				"name": "Content Fill",
				"ellipsis": true,
				"target": "tools/content_fill.content_fill"
			},
			{
				"divider": true
			},
			{
				"name": "Color Zoom",
				"ellipsis": true,
				"target": "tools/color_zoom.color_zoom"
			},
			{
				"name": "Replace Color",
				"ellipsis": true,
				"target": "tools/replace_color.replace_color"
			},
			{
				"name": "Restore Alpha",
				"ellipsis": true,
				"target": "tools/restore_alpha.restore_alpha"
			},
			{
				"name": "External",
				"children": [
					{
						"name": "TINYPNG - Compress PNG and JPEG",
						"href": "https://tinypng.com"
					},
					{
						"name": "REMOVE.BG - Remove Image Background",
						"href": "https://www.remove.bg"
					},
					{
						"name": "PNGTOSVG - Convert Image to SVG",
						"href": "https://www.pngtosvg.com"
					},
					{
						"name": "SQUOOSH - Compress and Compare Images",
						"href": "https://squoosh.app"
					}
				]
			},
			{
				"divider": true
			},
			{
				"name": "Language",
				"children": [
					{
						"name": "English",
						"target": "tools/translate.translate",
						"parameter": "en"
					},
					{
						"divider": true
					},
					{
						"name": "عربي",
						"target": "tools/translate.translate",
						"parameter": "ar"
					},
					{
						"name": "简体中文",
						"target": "tools/translate.translate",
						"parameter": "zh"
					},
					{
						"name": "Deutsch",
						"target": "tools/translate.translate",
						"parameter": "de"
					},
					{
						"name": "Dutch",
						"target": "tools/translate.translate",
						"parameter": "nl"
					},
					{
						"name": "English (UK)",
						"target": "tools/translate.translate",
						"parameter": "uk"
					},
					{
						"name": "Español",
						"target": "tools/translate.translate",
						"parameter": "es"
					},
					{
						"name": "Français",
						"target": "tools/translate.translate",
						"parameter": "fr"
					},
					{
						"name": "Greek",
						"target": "tools/translate.translate",
						"parameter": "el"
					},
					{
						"name": "Italiano",
						"target": "tools/translate.translate",
						"parameter": "it"
					},
					{
						"name": "日本語",
						"target": "tools/translate.translate",
						"parameter": "ja"
					},
					{
						"name": "한국어",
						"target": "tools/translate.translate",
						"parameter": "ko"
					},
					{
						"name": "Lietuvių",
						"target": "tools/translate.translate",
						"parameter": "lt"
					},
					{
						"name": "Português",
						"target": "tools/translate.translate",
						"parameter": "pt"
					},
					{
						"name": "русский язык",
						"target": "tools/translate.translate",
						"parameter": "ru"
					},
					{
						"name": "Türkçe",
						"target": "tools/translate.translate",
						"parameter": "tr"
					}
				]
			},
			{
				"name": "Search",
				"shortcut": "F3",
				"ellipsis": true,
				"target": "tools/search.search"
			},
			{
				"name": "환경 설정",
				"ellipsis": true,
				"target": "tools/settings.settings"
			}
		]
	},
	{
		"name": "창",
		"children": [
			{
				"name": "레이어",
				"shortcut": "F7",
				"target": "window/workspace.toggle_layers"
			},
			{
				"name": "색상",
				"shortcut": "F6",
				"target": "window/workspace.toggle_color"
			},
			{
				"name": "견본",
				"target": "window/workspace.toggle_swatches"
			},
			{
				"name": "속성",
				"target": "window/workspace.toggle_properties"
			},
			{
				"name": "조정",
				"target": "window/workspace.toggle_adjustments"
			},
			{
				"name": "작업 내역",
				"target": "window/workspace.toggle_history"
			},
			{
				"name": "내비게이터",
				"target": "window/workspace.toggle_navigator"
			},
			{
				"name": "정보",
				"shortcut": "F8",
				"target": "window/workspace.toggle_info"
			},
			{
				"name": "액션",
				"shortcut": "Alt+F9",
				"target": "window/workspace.toggle_actions"
			},
			{
				"name": "채널",
				"target": "window/workspace.toggle_channels"
			},
			{
				"name": "패스",
				"target": "window/workspace.toggle_paths"
			},
			{
				"name": "문자",
				"target": "window/workspace.toggle_character"
			},
			{
				"name": "단락",
				"target": "window/workspace.toggle_paragraph"
			},
			{
				"divider": true
			},
			{
				"name": "패널 숨기기/보이기",
				"shortcut": "Tab",
				"target": "window/workspace.toggle_all"
			},
			{
				"name": "필수 작업 영역 재설정",
				"target": "window/workspace.reset"
			}
		]
	},
	{
		"name": "Help",
		"children": [
			{
				"name": "키보드 단축키",
				"ellipsis": true,
				"target": "help/shortcuts.shortcuts"
			},
			{
				"name": "Report Issues",
				"href": "https://github.com/viliusle/miniPaint/issues"
			},
			{
				"divider": true
			},
			{
				"name": "About",
				"ellipsis": true,
				"target": "help/about.about"
			}
		]
	}
];

export default menuDefinition;
