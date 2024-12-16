// 贴纸类型定义
export const STICKER_TYPES = {
    door: { 
        icon: 'mdi:door', 
        name: '门', 
        width: 10,
        height: 90,
        getSvg: () => `
            <svg viewBox="0 0 10 90" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="10" height="90" fill="#666666" stroke="currentColor" stroke-width="2"/>
            </svg>`
    },
    bed: { 
        icon: 'mdi:bed', 
        name: '床', 
        width: 200,
        height: 150,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
                <rect x="20" y="20" width="60" height="60" fill="#fff" opacity="0.1"/>
            </svg>`
    },
    nightstand: { 
        icon: 'mdi:table-furniture', 
        name: '床头柜',
        width: 45,
        height: 45,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    wardrobe: { 
        icon: 'mdi:wardrobe', 
        name: '衣柜',
        width: 60,
        height: 150,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <line x1="50" y1="10" x2="50" y2="90" stroke="#fff" stroke-width="2" opacity="0.3"/>
                <rect x="15" y="15" width="30" height="70" fill="#fff" opacity="0.2"/>
                <rect x="55" y="15" width="30" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    mirror: {
        icon: 'mdi:mirror',
        name: '镜子',
        width: 60,
        height: 10,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="40" width="80" height="20" fill="currentColor"/>
                <rect x="15" y="45" width="70" height="10" fill="#fff" opacity="0.4"/>
            </svg>`
    },
    desk: {
        icon: 'mdi:desk',
        name: '桌子',
        width: 120,
        height: 60,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    chair: {
        icon: 'mdi:chair-rolling',
        name: '椅子',
        width: 45,
        height: 45,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="25" y="25" width="50" height="50" fill="currentColor"/>
                <rect x="30" y="30" width="40" height="40" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    coatrack: {
        icon: 'mdi:hanger',
        name: '衣帽架',
        width: 40,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <circle cx="50" cy="50" r="30" fill="currentColor"/>
                <circle cx="50" cy="50" r="20" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    cabinet: {
        icon: 'mdi:cabinet',
        name: '储物柜',
        width: 80,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <line x1="50" y1="10" x2="50" y2="90" stroke="#fff" stroke-width="2" opacity="0.3"/>
                <rect x="15" y="15" width="30" height="70" fill="#fff" opacity="0.2"/>
                <rect x="55" y="15" width="30" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    tvstand: {
        icon: 'mdi:television-classic',
        name: '电视柜',
        width: 160,
        height: 45,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="30" width="80" height="40" fill="currentColor"/>
                <rect x="15" y="35" width="70" height="30" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    plant: {
        icon: 'mdi:flower',
        name: '绿植',
        width: 40,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <circle cx="50" cy="50" r="30" fill="currentColor"/>
                <circle cx="50" cy="50" r="20" fill="#fff" opacity="0.3"/>
                <circle cx="50" cy="50" r="10" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    coffeetable: {
        icon: 'mdi:table-furniture',
        name: '茶几',
        width: 90,
        height: 50,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    sofa: {
        icon: 'mdi:sofa',
        name: '沙发',
        width: 200,
        height: 80,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    curtain: {
        icon: 'mdi:curtains',
        name: '窗帘',
        width: 160,
        height: 10,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="40" width="80" height="20" fill="currentColor"/>
                <path d="M15 45 h70 M15 55 h70" stroke="#fff" opacity="0.3" fill="none"/>
            </svg>`
    },
    speaker: {
        icon: 'mdi:speaker',
        name: '音箱',
        width: 30,
        height: 30,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="30" y="30" width="40" height="40" fill="currentColor"/>
                <circle cx="50" cy="50" r="10" fill="#fff" opacity="0.3"/>
            </svg>`
    },
    fan: {
        icon: 'mdi:fan',
        name: '风扇',
        width: 40,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <circle cx="50" cy="50" r="30" fill="currentColor"/>
                <circle cx="50" cy="50" r="20" fill="#fff" opacity="0.2"/>
                <circle cx="50" cy="50" r="5" fill="#fff" opacity="0.3"/>
            </svg>`
    },
    ac: {
        icon: 'mdi:air-conditioner',
        name: '空调',
        width: 100,
        height: 20,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="35" width="80" height="30" fill="currentColor"/>
                <rect x="15" y="40" width="70" height="20" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    aquarium: {
        icon: 'mdi:fish',
        name: '鱼缸',
        width: 80,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="20" width="80" height="60" fill="currentColor"/>
                <rect x="15" y="25" width="70" height="50" fill="#fff" opacity="0.3"/>
            </svg>`
    },
    diningtable: {
        icon: 'mdi:table',
        name: '餐桌',
        width: 140,
        height: 80,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
                <rect x="15" y="15" width="70" height="70" fill="#fff" opacity="0.2"/>
            </svg>`
    },
    lamp: {
        icon: 'mdi:floor-lamp',
        name: '落地灯',
        width: 40,
        height: 40,
        getSvg: () => `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                <circle cx="50" cy="50" r="20" fill="currentColor"/>
                <circle cx="50" cy="50" r="15" fill="#fff" opacity="0.3"/>
                <circle cx="50" cy="50" r="10" fill="#fff" opacity="0.2"/>
            </svg>`
    }
};

// 区域类型定义
export const AREA_TYPES = {
    0: { id: 'AreaTypeNone', name: '无' },
    1: { id: 'AreaTypeCloakroom', name: '衣帽间' },
    2: { id: 'AreaTypeDesk', name: '书桌' },
    3: { id: 'AreaTypeChaiseLongue', name: '躺椅' },
    4: { id: 'AreaTypeWardrobe', name: '衣柜' },
    5: { id: 'AreaTypeConferenceTable', name: '会议桌' },
    6: { id: 'AreaTypeNegotiation', name: '洽谈区' },
    7: { id: 'AreaTypeBed', name: '睡床' },
    8: { id: 'AreaTypeDrying', name: '晾衣区' },
    9: { id: 'AreaTypePlant', name: '绿植区' },
    10: { id: 'AreaTypeLeisure', name: '休闲区' },
    11: { id: 'AreaTypeWashbasin', name: '洗手台' },
    12: { id: 'AreaTypeCooking', name: '烹饪区' },
    13: { id: 'AreaTypeTV', name: '电视区' },
    14: { id: 'AreaTypeSofa', name: '沙发区' },
    15: { id: 'AreaTypeFitness', name: '健身区' },
    16: { id: 'AreaTypeEntertainment', name: '娱乐区' },
    17: { id: 'AreaTypeReading', name: '阅读区' },
    18: { id: 'AreaTypeShower', name: '淋浴区' },
    19: { id: 'AreaTypeStorage', name: '收纳区' },
    20: { id: 'AreaTypeBathtub', name: '浴缸区' },
    21: { id: 'AreaTypeToilet', name: '马桶区' },
    22: { id: 'AreaTypeStaircase', name: '楼梯' },
    23: { id: 'AreaTypeCorridor', name: '走廊' },
    24: { id: 'AreaTypeIntersection', name: '交叉口' },
    25: { id: 'AreaTypeDiningTable', name: '餐桌' },
    26: { id: 'AreaTypeRefrigerator', name: '冰箱' },
    27: { id: 'AreaTypeGradevin', name: '酒柜' },
    28: { id: 'AreaTypeOffice', name: '办公位' },
    29: { id: 'AreaTypeResting', name: '休息区' },
    30: { id: 'AreaTypeOther', name: '其他' },
    31: { id: 'AreaTypeDresser', name: '梳妆台' }
}; 