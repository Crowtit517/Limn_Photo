//main config file

var config = {};

config.TRANSPARENCY = false;
config.TRANSPARENCY_TYPE = 'squares'; //squares, green, grey
config.LANG = 'en';
config.WIDTH = null;
config.HEIGHT = null;
config.visible_width = null;
config.visible_height = null;
config.COLOR = '#000000';
config.BG_COLOR = '#ffffff';
config.ALPHA = 255;
config.ZOOM = 1;
config.SNAP = true;
config.pixabay_key = '3ca2cd8af3fde33af218bea02-9021417';
config.safe_search_can_be_disabled = true;
config.google_webfonts_key = 'AIzaSyBES3AipG'+'YVYNLtS,Vk-hJ11bbhJ9sTpRbA'.replace(',', '');
config.layers = [];
config.layer = null;
config.need_render = false;
config.need_render_changed_params = false; // Set specifically when param change in layer details triggered render
config.mouse = {};
config.mouse_lock = null;
config.swatches = {
	default: [] // Only default used right now, object format for swatch swapping in future.
};
config.user_fonts = {};
config.guides_enabled = true;
config.guides = [];
config.ruler_active = false;
config.enable_autoresize_by_default = true;

//requires styles in reset.css
config.themes = [
	'pro',
	'dark',
	'light',
	'green',
];

//no-translate BEGIN
config.FONTS = [
	"Arial",
	"Courier",
	"Impact",
	"Helvetica",
	"Monospace",
	"Tahoma",
	"Times New Roman",
	"Verdana",
	"Amatic SC",
	"Arimo",
	"Codystar",
	"Creepster",
	"Indie Flower",
	"Lato",
	"Lora",
	"Merriweather",
	"Monoton",
	"Montserrat",
	"Mukta",
	"Muli",
	"Nosifer",
	"Nunito",
	"Oswald",
	"Orbitron",
	"Pacifico",
	"PT Sans",
	"PT Serif",
	"Playfair Display",
	"Poppins",
	"Raleway",
	"Roboto",
	"Rubik",
	"Special Elite",
	"Tangerine",
	"Titillium Web",
	"Ubuntu"
];
//no-translate END

const SELECTION_MODES = ['새 선택', '선택 영역에 추가', '선택 영역에서 빼기', '선택 영역과 교차'];

config.TOOLS = [
	{
		name: 'marquee_rect',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
		},
	},
	{
		name: 'marquee_ellipse',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
		},
	},
	{
		name: 'lasso',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
		},
	},
	{
		name: 'polygon_lasso',
		on_leave: 'on_leave',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
		},
	},
	{
		name: 'object_select',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			sample_all: false,
		},
	},
	{
		name: 'spot_heal',
		attributes: {
			size: { value: 30, min: 1, max: 500 },
			sample_all: false,
		},
	},
	{
		name: 'healing',
		attributes: {
			size: { value: 40, min: 1, max: 500 },
			aligned: true,
		},
	},
	{
		name: 'quick_select',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			size: { value: 25, min: 1, max: 500 },
		},
	},
	{
		name: 'magnetic_lasso',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
			width: { value: 10, min: 2, max: 40 },
		},
	},
	{
		name: 'perspective_crop',
		attributes: {},
	},
	{
		name: 'pen',
		attributes: {},
	},
	{
		name: 'direct_select',
		attributes: {},
	},
	{
		name: 'vector_shape',
		visible: false,
		attributes: {
			fill: true,
			fill_color: '#000000',
			border: false,
			border_color: '#000000',
			border_size: 3,
		},
	},
	{
		name: 'red_eye',
		attributes: {
			pupil_size: { value: 50, min: 1, max: 100 },
			darken: { value: 50, min: 1, max: 100 },
		},
	},
	{
		name: 'patch',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			feather: { value: 0, min: 0, max: 250 },
		},
	},
	{
		name: 'magic_wand',
		attributes: {
			mode: { value: '새 선택', values: SELECTION_MODES },
			tolerance: { value: 32, min: 0, max: 255 },
			anti_alias: true,
			contiguous: true,
			sample_all: false,
		},
	},
	{
		name: 'dodge',
		attributes: {
			size: { value: 60, min: 1, max: 999 },
			hardness: { value: 0, min: 0, max: 100 },
			range: { value: '중간 영역', values: ['어두운 영역', '중간 영역', '밝은 영역'] },
			exposure: { value: 50, min: 1, max: 100 },
		},
	},
	{
		name: 'burn',
		attributes: {
			size: { value: 60, min: 1, max: 999 },
			hardness: { value: 0, min: 0, max: 100 },
			range: { value: '중간 영역', values: ['어두운 영역', '중간 영역', '밝은 영역'] },
			exposure: { value: 50, min: 1, max: 100 },
		},
	},
	{
		name: 'sponge',
		attributes: {
			size: { value: 60, min: 1, max: 999 },
			hardness: { value: 0, min: 0, max: 100 },
			mode: { value: '채도 감소', values: ['채도 감소', '채도 증가'] },
			flow: { value: 50, min: 1, max: 100 },
		},
	},
	{
		name: 'smudge',
		attributes: {
			size: { value: 40, min: 1, max: 999 },
			hardness: { value: 50, min: 0, max: 100 },
			strength: { value: 50, min: 1, max: 100 },
		},
	},
	{
		name: 'hand',
		on_activate: 'on_activate',
		attributes: {},
	},
	{
		name: 'rotate_view',
		title: '회전 보기 도구',
		on_activate: 'on_activate',
		attributes: {},
	},
	{
		name: 'zoom',
		on_activate: 'on_activate',
		attributes: {},
	},
	{
		name: 'transform',
		title: '자유 변형',
		on_activate: 'on_activate',
		on_leave: 'on_leave',
		attributes: {},
	},
	{
		name: 'select',
		title: 'Select object tool',
		attributes: {
			auto_select: true,
		},
	},
	{
		name: 'selection',
		attributes: {},
		on_leave: 'on_leave',
	},
	{
		name: 'brush',
		attributes: {
			size: 20,
			tip: { value: '원형', values: ['원형', '사각형', '분필', '스프레이', '잎사귀', '별'] },
			hardness: { value: 100, min: 0, max: 100 },
			spacing: { value: 25, min: 1, max: 200 },
			scatter: { value: 0, min: 0, max: 100 },
			opacity: { value: 100, min: 1, max: 100 },
			flow: { value: 100, min: 1, max: 100 },
			pressure: true,
			stabilizer: {
				value: 15,
				min: 0,
				max: 100,
			},
		},
	},
	{
		name: 'pencil',
		attributes: {
			size: 1,
			pressure: false,
		},
	},
	{
		name: 'pick_color',
		attributes: {
			sample_size: {
				value: '1 픽셀',
				values: ['1 픽셀', '3×3 평균', '5×5 평균', '11×11 평균'],
			},
			sample: {
				value: '모든 레이어',
				values: ['모든 레이어', '현재 및 아래', '현재 레이어'],
			},
		},
	},
	{
		name: 'erase',
		on_update: 'on_params_update',
		attributes: {
			size: 30,
			circle: true,
			strict: true,
		},
	},
	{
		name: 'magic_erase',
		title: 'Magic Eraser Tool',
		attributes: {
			power: 15,
			anti_aliasing: true,
			contiguous: false,
		},
	},
	{
		name: 'fill',
		attributes: {
			power: 5,
			anti_aliasing: false,
			contiguous: false,
		},
	},
	{
		name: 'shape',
		on_activate: 'on_activate',
		title: 'Shapes (H)',
		attributes: {
			size: 3,
			stroke: '#00aa00',
		},
	},
	{
		name: 'line',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'arrow',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'rectangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
			radius: {
				value: 0,
				min: 0,
			},
			square: false,
		},
	},
	{
		name: 'ellipse',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
			circle: false,
		},
	},
	{
		name: 'media',
		title: 'Search Images',
		on_activate: 'on_activate',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'right_triangle',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'romb',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'parallelogram',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'trapezoid',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'plus',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'regular_polygon',
		visible: false,
		attributes: {
			sides: { value: 5, min: 3, max: 100 },
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'pentagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'hexagon',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'star',
		visible: false,
		attributes: {
			border_size: 4,
			corners: 5,
			inner_radius: 40,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'heart',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'cylinder',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'human',
		visible: false,
		attributes: {
			border_size: 4,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'tear',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'cog',
		visible: false,
		attributes: {
			fill_color: '#555555',
		},
	},
	{
		name: 'bezier_curve',
		visible: false,
		attributes: {
			size: 4,
		},
	},
	{
		name: 'moon',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'callout',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
	{
		name: 'text',
		on_update: 'on_params_update',
		attributes: {
			font: {
				value: 'Arial',
				values() {
					const user_font_names = Object.keys(config.user_fonts);
					return ['', '[Add Font...]', ...Array.from(new Set([...config.FONTS, ...user_font_names].sort()))];
				}
			},
			size: 40,
			bold: {
				value: false,
				icon: `bold.svg`
			},
			italic: {
				value: false,
				icon: `italic.svg`
			},
			underline: {
				value: false,
				icon: `underline.svg`
			},
			strikethrough: {
				value: false,
				icon: `strikethrough.svg`
			},
			fill: '#000000',
			stroke: '#000000',
			stroke_size: {
				value: 0,
				min: 0,
				step: 0.1
			},
			kerning: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			},
			leading: {
				value: 0,
				min: -999,
				max: 999,
				step: 1
			}
		},
	},
	{
		name: 'gradient',
		on_activate: 'on_activate',
		attributes: {
			mode: {
				value: '전경색 → 배경색',
				values: ['전경색 → 배경색', '전경색 → 투명'],
			},
			radial: false,
			radial_power: 50,
		},
	},
	{
		name: 'clone',
		attributes: {
			size: 30,
			anti_aliasing: true,
			source_layer: {
				value: 'Current',
				values: ['Current', 'Previous'],
			},
		},
	},
	{
		name: 'crop',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			crop: true,
		},
	},
	{
		name: 'blur',
		attributes: {
			size: 30,
			strength: 1,
		},
	},
	{
		name: 'sharpen',
		attributes: {
			size: 30,
		},
	},
	{
		name: 'desaturate',
		attributes: {
			size: 50,
			anti_aliasing: true,
		},
	},
	{
		name: 'bulge_pinch',
		title: 'Bulge/Pinch Tool',
		attributes: {
			radius: 80,
			power: 50,
			bulge: true,
		},
	},
	{
		name: 'animation',
		on_activate: 'on_activate',
		on_update: 'on_params_update',
		on_leave: 'on_leave',
		attributes: {
			play: false,
			delay: 400,
		},
	},
	{
		name: 'polygon',
		visible: false,
		attributes: {
			border_size: 4,
			border: false,
			fill: true,
			border_color: '#555555',
			fill_color: '#000000',
		},
	},
];

//link to active tool
config.TOOL = config.TOOLS[2];
	
export default config;