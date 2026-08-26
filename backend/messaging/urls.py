from django.urls import path

from .views import DirectMessageView

urlpatterns = [
    path('messages/', DirectMessageView.as_view(), name='direct_messages'),
]
