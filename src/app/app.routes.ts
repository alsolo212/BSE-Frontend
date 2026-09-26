import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guard';
import { AdminDisputesPageComponent } from './pages/admin-disputes-page/admin-disputes-page';
import { AdminDisputeDetailsPageComponent } from './pages/admin-dispute-details-page/admin-dispute-details-page';
import { AdminListingReportsPageComponent } from './pages/admin-listing-reports-page/admin-listing-reports-page';
import { AdminSupportChatsPageComponent } from './pages/admin-support-chats-page/admin-support-chats-page';
import { AdminUserEditPageComponent } from './pages/admin-user-edit-page/admin-user-edit-page';
import { AdminUserProfilePageComponent } from './pages/admin-user-profile-page/admin-user-profile-page';
import { AdminUsersPageComponent } from './pages/admin-users-page/admin-users-page';
import { CatalogPageComponent } from './pages/catalog-page/catalog-page';
import { AuthPageComponent } from './pages/auth-page/auth-page';
import { CartPageComponent } from './pages/cart-page/cart-page';
import { CheckoutPageComponent } from './pages/checkout-page/checkout-page';
import { EditProfilePageComponent } from './pages/edit-profile-page/edit-profile-page';
import { ListingDetailsPageComponent } from './pages/listing-details-page/listing-details-page';
import { ListingEditorPageComponent } from './pages/listing-editor-page/listing-editor-page';
import { MainPageComponent } from './pages/main-page/main-page';
import { OrderTrackPageComponent } from './pages/order-track-page/order-track-page';
import { ErrorPageComponent } from './pages/error-page/error-page';
import { ProfilePageComponent } from './pages/profile-page/profile-page';
import { SellerProfilePageComponent } from './pages/seller-profile-page/seller-profile-page';
import { SellerOrderTrackPageComponent } from './pages/seller-order-track-page/seller-order-track-page';
import { ShipmentConfirmationPageComponent } from './pages/shipment-confirmation-page/shipment-confirmation-page';

export const routes: Routes = [
  {
    path: '',
    component: MainPageComponent,
    data: { title: 'Buy Sell Easy' }
  },
  {
    path: 'products',
    component: CatalogPageComponent,
    data: { title: 'Products' }
  },
  {
    path: 'auth',
    component: AuthPageComponent,
    canActivate: [guestGuard],
    data: { title: 'Login' }
  },
  {
    path: 'error',
    component: ErrorPageComponent,
    data: { title: 'Error' }
  },
  {
    path: 'profile/edit',
    component: EditProfilePageComponent,
    canActivate: [authGuard],
    data: { title: 'Edit Profile' }
  },
  {
    path: 'admin/users',
    component: AdminUsersPageComponent,
    canActivate: [adminGuard],
    data: { title: 'All Users' }
  },
  {
    path: 'admin/users/:id/edit',
    component: AdminUserEditPageComponent,
    canActivate: [adminGuard],
    data: { title: 'Edit User' }
  },
  {
    path: 'admin/users/:id',
    component: AdminUserProfilePageComponent,
    canActivate: [adminGuard],
    data: { title: 'User Profile' }
  },
  {
    path: 'admin/disputes',
    component: AdminDisputesPageComponent,
    canActivate: [adminGuard],
    data: { title: 'Disputes' }
  },
  {
    path: 'admin/disputes/:id',
    component: AdminDisputeDetailsPageComponent,
    canActivate: [adminGuard],
    data: { title: 'Dispute' }
  },
  {
    path: 'admin/chats',
    component: AdminSupportChatsPageComponent,
    canActivate: [adminGuard],
    data: { title: 'Support Chats' }
  },
  {
    path: 'admin/reports',
    component: AdminListingReportsPageComponent,
    canActivate: [adminGuard],
    data: { title: 'Reports' }
  },
  {
    path: 'cart',
    component: CartPageComponent,
    canActivate: [authGuard],
    data: { title: 'Cart' }
  },
  {
    path: 'checkout/cart',
    component: CheckoutPageComponent,
    canActivate: [authGuard],
    data: { mode: 'cart', title: 'Checkout' }
  },
  {
    path: 'checkout/listing/:id',
    component: CheckoutPageComponent,
    canActivate: [authGuard],
    data: { mode: 'listing', title: 'Checkout' }
  },
  {
    path: 'listings/new',
    component: ListingEditorPageComponent,
    canActivate: [authGuard],
    data: { mode: 'create', title: 'Add Product' }
  },
  {
    path: 'listings/:id/edit',
    component: ListingEditorPageComponent,
    canActivate: [authGuard],
    data: { mode: 'edit', title: 'Edit Product' }
  },
  {
    path: 'listings/:id',
    component: ListingDetailsPageComponent,
    data: { title: 'Product' }
  },
  {
    path: 'sellers/:id',
    component: SellerProfilePageComponent,
    data: { title: 'Seller Profile' }
  },
  {
    path: 'profile',
    component: ProfilePageComponent,
    canActivate: [authGuard],
    data: { title: 'Profile' }
  },
  {
    path: 'orders/:id/track',
    component: OrderTrackPageComponent,
    canActivate: [authGuard],
    data: { title: 'Track Order' }
  },
  {
    path: 'orders/:id/seller-track',
    component: SellerOrderTrackPageComponent,
    canActivate: [authGuard],
    data: { title: 'Track Order' }
  },
  {
    path: 'orders/:id/shipment-confirmation',
    component: ShipmentConfirmationPageComponent,
    canActivate: [authGuard],
    data: { title: 'Shipment Confirmation' }
  },
  {
    path: '**',
    component: ErrorPageComponent,
    data: { code: '404', title: 'Page Not Found' }
  }
];
