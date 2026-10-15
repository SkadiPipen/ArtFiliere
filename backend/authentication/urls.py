from django.urls import path
from .views import ChatUsersView, login, me, register
from users.royalty_views import RoyaltyApplicationView, RoyaltyReviewView, RoyaltyPermitView
from users.settings_views import AccountSettingsView, ArtistRecordUpdateView, ArtistRecordReviewView

urlpatterns = [
    path('settings/', AccountSettingsView.as_view()),
    path('settings/bir/', ArtistRecordUpdateView.as_view()),
    path('settings/bir/reviews/', ArtistRecordReviewView.as_view()),
    path('settings/bir/reviews/<int:update_id>/', ArtistRecordReviewView.as_view()),
    path('royalty/', RoyaltyApplicationView.as_view()),
    path('royalty/permit/', RoyaltyPermitView.as_view()),
    path('royalty/reviews/', RoyaltyReviewView.as_view()),
    path('royalty/reviews/<int:application_id>/', RoyaltyReviewView.as_view()),
    path("chat-users/", ChatUsersView.as_view(), name="chat_users"),

    path("login/",login),
    path("register/", register),
    path("me/", me),

]
