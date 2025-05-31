// Add to routes/adminRoutes.js
const adminRoutes = [
    {
      path: '/admin/reviews',
      component: ReviewList,
      exact: true
    },
    {
      path: '/admin/reviews/new',
      component: ReviewModal,
      exact: true
    },
    {
      path: '/admin',
      component: AdminDashboard,
      exact: true,
      requiredRoles: [ROLES.SUPER_ADMIN, ROLES.EDITOR]
    },
    {
      path: '/admin/news',
      component: NewsList,
      exact: true,
      requiredRoles: [ROLES.SUPER_ADMIN, ROLES.EDITOR]
    }
  ];