export default {
  pages: ['pages/index/index', 'pages/events/index', 'pages/characters/index', 'pages/clubs/index', 'pages/members/index', 'pages/profile/index', 'pages/login/index', 'pages/lineup/index'],
  window: { navigationBarBackgroundColor: '#191919', navigationBarTextStyle: 'white', navigationBarTitleText: '诡秘之主俱乐部', backgroundColor: '#f8f7f4' },
  tabBar: {
    color: '#8e8b85', selectedColor: '#8b5e35', backgroundColor: '#fffdf9', borderStyle: 'white',
    list: [
      { pagePath: 'pages/index/index', text: '概览' },
      { pagePath: 'pages/events/index', text: '日程' },
      { pagePath: 'pages/characters/index', text: '角色' },
      { pagePath: 'pages/clubs/index', text: '俱乐部' },
      { pagePath: 'pages/profile/index', text: '我的' },
    ],
  },
}
