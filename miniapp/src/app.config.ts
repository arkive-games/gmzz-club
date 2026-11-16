export default {
  pages: ['pages/index/index', 'pages/events/index', 'pages/characters/index', 'pages/members/index', 'pages/login/index'],
  window: { navigationBarBackgroundColor: '#191919', navigationBarTextStyle: 'white', navigationBarTitleText: '诡秘之主俱乐部', backgroundColor: '#f8f7f4' },
  tabBar: {
    color: '#8e8b85', selectedColor: '#8b5e35', backgroundColor: '#fffdf9', borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index', text: '概览' },
      { pagePath: 'pages/events/index', text: '活动' },
      { pagePath: 'pages/characters/index', text: '角色' },
      { pagePath: 'pages/members/index', text: '成员' },
    ],
  },
  lazyCodeLoading: 'requiredComponents',
}
