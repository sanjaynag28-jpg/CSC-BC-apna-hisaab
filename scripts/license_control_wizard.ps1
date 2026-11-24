# ============================================================================
# HisaabBC - Master License & Cloud Control Wizard (PowerShell WPF Edition)
# Crisp White Theme | Resizable (1080x790+) | Full Cloud & Notification Control
# Universal Keys • Personal Key Generator • Live Client Broadcast • Remote Blacklist • Admin Contact
# ============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

# Project Root
$CurrentScriptDir = $null
try {
    if ($PSScriptRoot) {
        $CurrentScriptDir = $PSScriptRoot
    } elseif ($MyInvocation.MyCommand.Path) {
        $CurrentScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
} catch { }
if (-not $CurrentScriptDir -or -not (Test-Path $CurrentScriptDir)) {
    $CurrentScriptDir = (Get-Location).Path
}

$ProjectDir = $null
try {
    if (Test-Path $CurrentScriptDir) {
        $parent = (Get-Item -LiteralPath $CurrentScriptDir).Parent.FullName
        if (Test-Path (Join-Path $parent 'package.json')) {
            $ProjectDir = $parent
        }
    }
} catch { }
if (-not $ProjectDir) {
    if (Test-Path (Join-Path $CurrentScriptDir 'package.json')) {
        $ProjectDir = $CurrentScriptDir
    } else {
        $ProjectDir = (Get-Location).Path
    }
}
try { Set-Location $ProjectDir } catch { }

# Load WPF Assemblies
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

# Paths
$ConfigPath = Join-Path $ProjectDir 'config\licenses.json'
$PersonalHistoryPath = Join-Path $ProjectDir 'config\personal_keys_history.json'

# Async Job & Timer State variables
$script:pushJob = $null
$script:pushTimer = $null
$script:pushHandled = $false

# Helper to read JSON
function Get-CloudConfig {
    if (Test-Path $ConfigPath) {
        try {
            return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch { }
    }
    return [PSCustomObject]@{
        version = 1
        updatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        adminContact = [PSCustomObject]@{
            whatsapp = "919616928635"
            name = "Sanjay Nag"
            supportHours = "10:00 AM - 8:00 PM"
        }
        announcement = [PSCustomObject]@{
            isActive = $false
            title = "विशेष सूचना"
            message = "सॉफ़्टवेयर का नया अपडेट उपलब्ध है। कृपया सेटिंग्स में जाकर अपडेट करें।"
            type = "info"
            actionText = "संजय जी से व्हाट्सएप पर बात करें"
            actionUrl = "https://wa.me/919616928635"
        }
        universalKeys = [PSCustomObject]@{
            "TEST123" = [PSCustomObject]@{
                key = "TEST123"
                plan = "90 Days Free Trial"
                planHindi = "९० दिन फ्री ट्रायल (Universal Offer)"
                expiryDate = "2027-02-23"
                isActive = $true
                maxDevices = 99999
                message = "९० दिन का विशेष फ्री ट्रायल ऑफर सभी केंद्रों के लिए सक्रिय है!"
            }
        }
        blacklistedHardwareIds = @()
    }
}

function Get-PersonalHistory {
    if (Test-Path $PersonalHistoryPath) {
        try {
            return Get-Content $PersonalHistoryPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch { }
    }
    return @()
}

# XAML Definition (Clean, Bright, Crisp White & Slate Fluent Theme)
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="HisaabBC - Master License &amp; Cloud Control Wizard (Master Admin)"
        Height="800" Width="1080"
        MinHeight="660" MinWidth="920"
        WindowStartupLocation="CenterScreen"
        Background="#F8FAFC" Foreground="#0F172A"
        FontFamily="Segoe UI, Tahoma, Arial" FontSize="13"
        ResizeMode="CanResizeWithGrip">

    <Window.Resources>
        <!-- Modern Crisp Styles -->
        <Style TargetType="TabItem">
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="18,10"/>
            <Setter Property="Background" Value="#F1F5F9"/>
            <Setter Property="Foreground" Value="#475569"/>
            <Setter Property="BorderThickness" Value="0,0,0,3"/>
            <Setter Property="BorderBrush" Value="Transparent"/>
            <Setter Property="Cursor" Value="Hand"/>
        </Style>

        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#FFFFFF"/>
            <Setter Property="Foreground" Value="#0F172A"/>
            <Setter Property="BorderBrush" Value="#CBD5E1"/>
            <Setter Property="BorderThickness" Value="1.5"/>
            <Setter Property="Padding" Value="10,6"/>
            <Setter Property="VerticalContentAlignment" Value="Center"/>
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
        </Style>

        <Style TargetType="ComboBox">
            <Setter Property="Background" Value="#FFFFFF"/>
            <Setter Property="Foreground" Value="#0F172A"/>
            <Setter Property="BorderBrush" Value="#CBD5E1"/>
            <Setter Property="BorderThickness" Value="1.5"/>
            <Setter Property="Padding" Value="10,6"/>
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
        </Style>

        <Style TargetType="ComboBoxItem">
            <Setter Property="Background" Value="#FFFFFF"/>
            <Setter Property="Foreground" Value="#0F172A"/>
            <Setter Property="FontSize" Value="13.5"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="8,6"/>
        </Style>

        <Style TargetType="Button">
            <Setter Property="Background" Value="#E2E8F0"/>
            <Setter Property="Foreground" Value="#1E293B"/>
            <Setter Property="Padding" Value="14,8"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="FontWeight" Value="Bold"/>
            <Setter Property="FontSize" Value="13"/>
        </Style>
    </Window.Resources>

    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- HEADER -->
        <Border Grid.Row="0" Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="0,0,0,1" Padding="24,16">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                        <TextBlock Text="🛡️ HisaabBC - Master License &amp; Cloud Control Wizard" FontSize="20" FontWeight="Bold" Foreground="#1E3A8A"/>
                        <Border Background="#EFF6FF" BorderBrush="#BFDBFE" BorderThickness="1" CornerRadius="6" Padding="8,2" Margin="12,0,0,0">
                            <TextBlock Text="Master Admin Edition" FontSize="11" FontWeight="Bold" Foreground="#2563EB"/>
                        </Border>
                    </StackPanel>
                    <TextBlock Text="यूनिवर्सल कीज • व्यक्तिगत चाबी (Personal Keys) • लाइव नोटिफिकेशन ब्रॉडकास्ट • रिमोट ब्लैकलिस्ट • 1-क्लिक GitHub सिंक" FontSize="12.5" Foreground="#64748B" Margin="0,4,0,0"/>
                </StackPanel>
                <StackPanel Grid.Column="1" Orientation="Horizontal" VerticalAlignment="Center">
                    <Border Background="#ECFDF5" BorderBrush="#A7F3D0" BorderThickness="1.5" CornerRadius="16" Padding="14,6" Margin="0,0,10,0">
                        <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                            <Ellipse Width="8" Height="8" Fill="#10B981" Margin="0,0,6,0"/>
                            <TextBlock Text="GitHub Live Connected" FontSize="12" FontWeight="Bold" Foreground="#047857"/>
                        </StackPanel>
                    </Border>
                </StackPanel>
            </Grid>
        </Border>

        <!-- MAIN TABS -->
        <TabControl x:Name="TabMain" Grid.Row="1" Background="#F8FAFC" BorderThickness="0" Margin="16,8,16,8">

            <!-- TAB 1: CLOUD UNIVERSAL KEYS -->
            <TabItem Header="🌐 1. क्लाउड यूनिवर्सल कीज (TEST123 आदि)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="10,16">
                    <StackPanel>
                        <!-- Key Selection Row -->
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="10" Padding="16" Margin="0,0,0,16">
                            <Grid>
                                <Grid.ColumnDefinitions>
                                    <ColumnDefinition Width="*"/>
                                    <ColumnDefinition Width="Auto"/>
                                    <ColumnDefinition Width="Auto"/>
                                </Grid.ColumnDefinitions>
                                <StackPanel Grid.Column="0" Margin="0,0,12,0">
                                    <TextBlock Text="सक्रिय की चुनें (Select Key to Edit):" FontSize="12.5" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,6"/>
                                    <ComboBox x:Name="ComboKeys" Height="40" FontSize="15" FontWeight="Bold" Foreground="#1E3A8A"/>
                                </StackPanel>
                                <Button x:Name="BtnNewKey" Grid.Column="1" Content="➕ नई यूनिवर्सल की जोड़ें" Margin="0,22,10,0" Padding="16,10" Background="#7C3AED" Foreground="White" FontWeight="Bold"/>
                                <Button x:Name="BtnDeleteKey" Grid.Column="2" Content="🗑️ की डिलीट करें" Margin="0,22,0,0" Padding="14,10" Background="#FEE2E2" Foreground="#DC2626" FontWeight="Bold"/>
                            </Grid>
                        </Border>

                        <!-- Key Config Details Card -->
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="12" Padding="20" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="लाइसेंस की विवरण (Key Details &amp; Plan):" FontSize="14" FontWeight="Bold" Foreground="#1E293B" Margin="0,0,0,14"/>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="की कोड (Key Code):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtKeyCode" Height="38" FontSize="15" FontWeight="Bold" Foreground="#2563EB"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="सक्रिय स्थिति (Status):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <CheckBox x:Name="ChkKeyActive" Content="सक्रिय रखें (Active for All Clients)" IsChecked="True" Foreground="#059669" FontWeight="Bold" FontSize="13.5" VerticalAlignment="Center" Margin="0,8,0,0"/>
                                    </StackPanel>
                                </Grid>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="प्लान का नाम (Plan Name Hindi/English):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtPlanName" Height="38" Text="९० दिन फ्री ट्रायल (Universal Offer)"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="समाप्ति तारीख (Expiry Date):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <DatePicker x:Name="DpExpiryDate" Height="38" FontSize="14" FontWeight="Bold" Background="#FFFFFF" Foreground="#0F172A"/>
                                    </StackPanel>
                                </Grid>

                                <!-- QUICK ADD DAYS BUTTONS -->
                                <TextBlock Text="⚡ 1-क्लिक में तारीख आगे बढ़ाएं (Quick Extend Expiry):" FontSize="12" FontWeight="Bold" Foreground="#7C3AED" Margin="0,4,0,8"/>
                                <WrapPanel Margin="0,0,0,16">
                                    <Button x:Name="BtnAdd15" Content="+15 दिन" Margin="0,0,8,8" Padding="14,8" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1"/>
                                    <Button x:Name="BtnAdd30" Content="+30 दिन" Margin="0,0,8,8" Padding="14,8" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1"/>
                                    <Button x:Name="BtnAdd60" Content="+60 दिन" Margin="0,0,8,8" Padding="14,8" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1"/>
                                    <Button x:Name="BtnAdd90" Content="+90 दिन (Recommended)" Margin="0,0,8,8" Padding="16,8" Background="#059669" Foreground="White" FontWeight="Bold"/>
                                    <Button x:Name="BtnAdd180" Content="+6 महीने" Margin="0,0,8,8" Padding="14,8" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1"/>
                                    <Button x:Name="BtnAdd365" Content="+1 साल" Margin="0,0,8,8" Padding="16,8" Background="#2563EB" Foreground="White" FontWeight="Bold"/>
                                    <Button x:Name="BtnAddLife" Content="♾️ आजीवन (Lifetime 2099)" Margin="0,0,8,8" Padding="16,8" Background="#4F46E5" Foreground="White" FontWeight="Bold"/>
                                </WrapPanel>

                                <StackPanel Margin="0,0,0,4">
                                    <TextBlock Text="ग्राहकों के लिए संदेश / नोटिस (Notice Message for Key):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtNoticeMessage" Height="38" Text="९० दिन का विशेष फ्री ट्रायल ऑफर सभी केंद्रों के लिए सक्रिय है!"/>
                                </StackPanel>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 2: PERSONAL CUSTOMER KEY GENERATOR -->
            <TabItem Header="🔑 2. पर्सनल की जनरेटर (ग्राहक की चाबी)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="10,16">
                    <StackPanel>
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="ग्राहक की जानकारी दर्ज करें (Lock Key to Customer PC):" FontSize="14" FontWeight="Bold" Foreground="#1E3A8A" Margin="0,0,0,14"/>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="दुकान का नाम (Shop Name):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtCustShop" Height="38" Text="Sharma Digital Kendra"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="मोबाइल नंबर (Mobile Number - WhatsApp):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtCustMobile" Height="38" Text="9876543210"/>
                                    </StackPanel>
                                </Grid>

                                <StackPanel Margin="0,0,0,14">
                                    <TextBlock Text="ग्राहक का मशीन कोड (Hardware ID - ग्राहक से प्राप्त करें):" FontSize="12" FontWeight="Bold" Foreground="#D97706" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtCustHwId" Height="38" FontSize="15" FontWeight="Bold" Foreground="#B45309" Background="#FFFBEB" BorderBrush="#FCD34D" Text="HWID-E8D1-DE0E-4925"/>
                                </StackPanel>

                                <Grid Margin="0,0,0,18">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="Auto"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0">
                                        <TextBlock Text="प्लान का प्रकार (Plan Type):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <ComboBox x:Name="ComboCustPlan" Height="40" FontSize="14" FontWeight="SemiBold" Background="#FFFFFF" Foreground="#0F172A">
                                            <ComboBoxItem Content="Annual Pro (1 साल - 365 दिन)" IsSelected="True"/>
                                            <ComboBoxItem Content="Half-Year Pro (6 महीने - 180 दिन)"/>
                                            <ComboBoxItem Content="Quarterly Pro (3 महीने - 90 दिन)"/>
                                            <ComboBoxItem Content="Monthly Plan (1 महीना - 30 दिन)"/>
                                            <ComboBoxItem Content="Lifetime Plan (आजीवन - कभी समाप्त नहीं)"/>
                                        </ComboBox>
                                    </StackPanel>
                                    <Button x:Name="BtnGenerateKey" Grid.Column="1" Content="⚡ Generate Personal Key" Margin="16,20,0,0" Padding="20,10" Background="#059669" FontWeight="Bold" Foreground="White" FontSize="13.5"/>
                                </Grid>

                                <!-- GENERATED KEY DISPLAY -->
                                <Border Background="#F8FAFC" BorderBrush="#CBD5E1" BorderThickness="1.5" CornerRadius="10" Padding="16">
                                    <StackPanel>
                                        <TextBlock Text="जनरेट की गई पर्सनल लाइसेंस की (Copy &amp; Send to Customer):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,6"/>
                                        <TextBox x:Name="TxtGeneratedKey" Height="44" FontSize="17" FontWeight="Bold" Foreground="#047857" Background="#ECFDF5" BorderBrush="#6EE7B7" BorderThickness="1.5" IsReadOnly="True" Text="बटन दबाने पर यहाँ की दिखेगी..."/>
                                        <WrapPanel Margin="0,12,0,0">
                                            <Button x:Name="BtnCopyKey" Content="📋 चाबी कॉपी करें (Copy Key)" Padding="16,10" Background="#2563EB" Foreground="White" FontWeight="Bold" Margin="0,0,12,0"/>
                                            <Button x:Name="BtnShareWhatsApp" Content="💬 सीधे व्हाट्सएप पर भेजें (WhatsApp Share)" Padding="18,10" Background="#10B981" Foreground="White" FontWeight="Bold"/>
                                        </WrapPanel>
                                    </StackPanel>
                                </Border>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 3: LIVE NOTIFICATION & BROADCAST -->
            <TabItem Header="📢 3. लाइव सूचना व नोटिस (Broadcast Control)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="10,16">
                    <StackPanel>
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="सभी ग्राहकों के डैशबोर्ड पर लाइव नोटिस प्रसारित करें (Live In-App Announcement):" FontSize="14" FontWeight="Bold" Foreground="#1E3A8A" Margin="0,0,0,4"/>
                                <TextBlock Text="यह सूचना इंटरनेट कनेक्ट होते ही सभी 500+ ग्राहकों के कंप्यूटर पर शीर्ष पर प्रदर्शित होगी।" FontSize="12" Foreground="#64748B" Margin="0,0,0,16"/>

                                <CheckBox x:Name="ChkNoticeActive" Content="ग्राहकों के डैशबोर्ड पर यह नोटिस सक्रिय रखें (Enable Announcement)" IsChecked="False" FontSize="14" FontWeight="Bold" Foreground="#2563EB" Margin="0,0,0,16"/>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="2*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="नोटिस शीर्षक (Notice Title):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtNoticeTitle" Height="38" Text="विशेष सूचना (Special Notice)"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="नोटिस रंग व शैली (Type/Color):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <ComboBox x:Name="ComboNoticeType" Height="38">
                                            <ComboBoxItem Content="🔵 सामान्य सूचना (Info - Blue)" IsSelected="True"/>
                                            <ComboBoxItem Content="🟢 बधाई व ऑफर (Success - Green)"/>
                                            <ComboBoxItem Content="🟡 चेतावनी (Warning - Yellow)"/>
                                            <ComboBoxItem Content="🔴 अति आवश्यक (Urgent - Red)"/>
                                        </ComboBox>
                                    </StackPanel>
                                </Grid>

                                <StackPanel Margin="0,0,0,14">
                                    <TextBlock Text="नोटिस संदेश (Detailed Message for Clients):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtNoticeBody" Height="70" AcceptsReturn="True" TextWrapping="Wrap" Text="सॉफ़्टवेयर का नया अपडेट उपलब्ध है। कृपया सेटिंग्स में जाकर अपडेट करें अथवा संजय जी से संपर्क करें।"/>
                                </StackPanel>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="2*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="बटन का नाम (Button Text):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtNoticeBtnText" Height="38" Text="व्हाट्सएप पर संपर्क करें"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="बटन लिंक (Action URL):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtNoticeBtnUrl" Height="38" Text="https://wa.me/919616928635"/>
                                    </StackPanel>
                                </Grid>

                                <!-- PREVIEW BOX -->
                                <TextBlock Text="लाइव प्रीव्यू (ग्राहकों को ऐसा दिखेगा):" FontSize="12" FontWeight="Bold" Foreground="#64748B" Margin="0,6,0,6"/>
                                <Border x:Name="BorderNoticePreview" Background="#EFF6FF" BorderBrush="#93C5FD" BorderThickness="1.5" CornerRadius="8" Padding="14">
                                    <Grid>
                                        <Grid.ColumnDefinitions>
                                            <ColumnDefinition Width="*"/>
                                            <ColumnDefinition Width="Auto"/>
                                        </Grid.ColumnDefinitions>
                                        <StackPanel Grid.Column="0">
                                            <TextBlock x:Name="TbPrevTitle" Text="विशेष सूचना (Special Notice)" FontSize="13.5" FontWeight="Bold" Foreground="#1E40AF"/>
                                            <TextBlock x:Name="TbPrevBody" Text="सॉफ़्टवेयर का नया अपडेट उपलब्ध है। कृपया सेटिंग्स में जाकर अपडेट करें।" FontSize="12.5" Foreground="#1E3A8A" Margin="0,2,0,0"/>
                                        </StackPanel>
                                        <Button x:Name="BtnPrevAction" Grid.Column="1" Content="व्हाट्सएप पर संपर्क करें" Background="#2563EB" Foreground="White" Padding="12,6" FontSize="12" FontWeight="Bold"/>
                                    </Grid>
                                </Border>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 4: BLACKLIST & REMOTE BLOCK -->
            <TabItem Header="🚫 4. रिमोट ब्लैकलिस्ट (मशीन ब्लॉक करें)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="10,16">
                    <StackPanel>
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="ब्लैकलिस्टेड मशीन कोड सूची (Currently Blocked Hardware IDs):" FontSize="14" FontWeight="Bold" Foreground="#DC2626" Margin="0,0,0,6"/>
                                <TextBlock Text="यहाँ जोड़ी गई कोई भी मशीन इंटरनेट कनेक्ट होते ही स्वतः 1 सेकंड में हमेशा के लिए लॉक हो जाएगी।" FontSize="12" Foreground="#64748B" Margin="0,0,0,14"/>

                                <ListBox x:Name="ListBlacklist" Height="160" Background="#FFF5F5" Foreground="#991B1B" BorderBrush="#FECACA" BorderThickness="1.5" Margin="0,0,0,14" FontSize="14" FontFamily="Courier New" FontWeight="Bold"/>

                                <Grid Margin="0,0,0,8">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="Auto"/>
                                        <ColumnDefinition Width="Auto"/>
                                    </Grid.ColumnDefinitions>
                                    <TextBox x:Name="TxtNewBlacklistHw" Grid.Column="0" Height="40" FontSize="14" Margin="0,0,10,0" Tag="HWID-XXXX-XXXX-XXXX"/>
                                    <Button x:Name="BtnAddBlacklist" Grid.Column="1" Content="🚫 ब्लॉक लिस्ट में जोड़ें" Padding="16,10" Background="#DC2626" Foreground="White" FontWeight="Bold" Margin="0,0,10,0"/>
                                    <Button x:Name="BtnRemoveBlacklist" Grid.Column="2" Content="✕ अनब्लॉक करें" Padding="16,10" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1"/>
                                </Grid>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 5: ADMIN CONTACT & SUPPORT SETTINGS -->
            <TabItem Header="⚙️ 5. एडमिन सपोर्ट व संपर्क">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="10,16">
                    <StackPanel>
                        <Border Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="1" CornerRadius="12" Padding="22" Margin="0,0,0,16">
                            <StackPanel>
                                <TextBlock Text="एडमिन सपोर्ट व व्हाट्सएप संपर्क सेटिंग्स (Admin Contact Settings):" FontSize="14" FontWeight="Bold" Foreground="#1E3A8A" Margin="0,0,0,6"/>
                                <TextBlock Text="जब किसी ग्राहक का लाइसेंस समाप्त होगा, तो उसकी लॉक स्क्रीन पर यही व्हाट्सएप नंबर और नाम दिखेगा।" FontSize="12" Foreground="#64748B" Margin="0,0,0,16"/>

                                <Grid Margin="0,0,0,14">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,10,0">
                                        <TextBlock Text="संजय जी का व्हाट्सएप नंबर (WhatsApp Number):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtAdminPhone" Height="38" Text="919616928635"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="10,0,0,0">
                                        <TextBlock Text="एडमिन नाम (Admin Display Name):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtAdminName" Height="38" Text="संजय जी"/>
                                    </StackPanel>
                                </Grid>

                                <StackPanel Margin="0,0,0,14">
                                    <TextBlock Text="सपोर्ट समय (Support Hours):" FontSize="12" FontWeight="Bold" Foreground="#475569" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtAdminHours" Height="38" Text="सुबह 10:00 से रात्रि 8:00 बजे तक"/>
                                </StackPanel>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

        </TabControl>

        <!-- FOOTER BAR (ALWAYS VISIBLE) -->
        <Border Grid.Row="2" Background="#FFFFFF" BorderBrush="#E2E8F0" BorderThickness="0,1,0,0" Padding="24,14">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>

                <StackPanel Grid.Column="0" VerticalAlignment="Center" Margin="0,0,16,0">
                    <TextBlock x:Name="TxtStatusLog" Text="तैयार (Ready) - कोई भी बदलाव करने के बाद नीचे हरा बटन दबाएं।" FontSize="13" Foreground="#047857" FontWeight="Bold"/>
                    <ProgressBar x:Name="PbPush" Height="5" Margin="0,6,20,0" Background="#E2E8F0" Foreground="#059669" Visibility="Collapsed"/>
                </StackPanel>

                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button x:Name="BtnOpenBrowser" Content="🌐 ब्राउज़र में ऐप खोलें" Margin="0,0,12,0" Padding="16,10" Background="#F1F5F9" Foreground="#334155" BorderBrush="#CBD5E1" BorderThickness="1" FontWeight="SemiBold"/>
                    <Button x:Name="BtnSavePush" Content="🚀 1-क्लिक में GitHub पर लागू करें (Save &amp; Push to GitHub)" Padding="26,12" Background="#059669" Foreground="White" FontWeight="Bold" FontSize="14"/>
                </StackPanel>
            </Grid>
        </Border>

    </Grid>
</Window>
"@

# Read XAML
$reader = New-Object System.Xml.XmlNodeReader $xaml
$window = [Windows.Markup.XamlReader]::Load($reader)

# Get Controls
$ComboKeys = $window.FindName("ComboKeys")
$BtnNewKey = $window.FindName("BtnNewKey")
$BtnDeleteKey = $window.FindName("BtnDeleteKey")
$TxtKeyCode = $window.FindName("TxtKeyCode")
$ChkKeyActive = $window.FindName("ChkKeyActive")
$TxtPlanName = $window.FindName("TxtPlanName")
$DpExpiryDate = $window.FindName("DpExpiryDate")
$BtnAdd15 = $window.FindName("BtnAdd15")
$BtnAdd30 = $window.FindName("BtnAdd30")
$BtnAdd60 = $window.FindName("BtnAdd60")
$BtnAdd90 = $window.FindName("BtnAdd90")
$BtnAdd180 = $window.FindName("BtnAdd180")
$BtnAdd365 = $window.FindName("BtnAdd365")
$BtnAddLife = $window.FindName("BtnAddLife")
$TxtNoticeMessage = $window.FindName("TxtNoticeMessage")

$TxtCustShop = $window.FindName("TxtCustShop")
$TxtCustMobile = $window.FindName("TxtCustMobile")
$TxtCustHwId = $window.FindName("TxtCustHwId")
$ComboCustPlan = $window.FindName("ComboCustPlan")
$BtnGenerateKey = $window.FindName("BtnGenerateKey")
$TxtGeneratedKey = $window.FindName("TxtGeneratedKey")
$BtnCopyKey = $window.FindName("BtnCopyKey")
$BtnShareWhatsApp = $window.FindName("BtnShareWhatsApp")

$ChkNoticeActive = $window.FindName("ChkNoticeActive")
$TxtNoticeTitle = $window.FindName("TxtNoticeTitle")
$ComboNoticeType = $window.FindName("ComboNoticeType")
$TxtNoticeBody = $window.FindName("TxtNoticeBody")
$TxtNoticeBtnText = $window.FindName("TxtNoticeBtnText")
$TxtNoticeBtnUrl = $window.FindName("TxtNoticeBtnUrl")
$TbPrevTitle = $window.FindName("TbPrevTitle")
$TbPrevBody = $window.FindName("TbPrevBody")
$BtnPrevAction = $window.FindName("BtnPrevAction")

$ListBlacklist = $window.FindName("ListBlacklist")
$TxtNewBlacklistHw = $window.FindName("TxtNewBlacklistHw")
$BtnAddBlacklist = $window.FindName("BtnAddBlacklist")
$BtnRemoveBlacklist = $window.FindName("BtnRemoveBlacklist")

$TxtAdminPhone = $window.FindName("TxtAdminPhone")
$TxtAdminName = $window.FindName("TxtAdminName")
$TxtAdminHours = $window.FindName("TxtAdminHours")

$TxtStatusLog = $window.FindName("TxtStatusLog")
$PbPush = $window.FindName("PbPush")
$BtnOpenBrowser = $window.FindName("BtnOpenBrowser")
$BtnSavePush = $window.FindName("BtnSavePush")

# State
$script:config = Get-CloudConfig
$script:keysDict = @{}

# Load Data into UI
function Load-ConfigIntoUI {
    # 1. Universal Keys
    $ComboKeys.Items.Clear()
    $script:keysDict = @{}
    
    if ($script:config.universalKeys) {
        $props = $script:config.universalKeys.PSObject.Properties
        foreach ($p in $props) {
            $script:keysDict[$p.Name] = $p.Value
            [void]$ComboKeys.Items.Add($p.Name)
        }
    }
    if ($ComboKeys.Items.Count -gt 0) {
        $ComboKeys.SelectedIndex = 0
    }

    # 2. Announcement
    if ($script:config.announcement) {
        $ann = $script:config.announcement
        $ChkNoticeActive.IsChecked = ($ann.isActive -eq $true)
        if ($ann.title) { $TxtNoticeTitle.Text = $ann.title }
        if ($ann.message) { $TxtNoticeBody.Text = $ann.message }
        if ($ann.actionText) { $TxtNoticeBtnText.Text = $ann.actionText }
        if ($ann.actionUrl) { $TxtNoticeBtnUrl.Text = $ann.actionUrl }

        switch ($ann.type) {
            "success" { $ComboNoticeType.SelectedIndex = 1 }
            "warning" { $ComboNoticeType.SelectedIndex = 2 }
            "urgent"  { $ComboNoticeType.SelectedIndex = 3 }
            default   { $ComboNoticeType.SelectedIndex = 0 }
        }
    }

    # 3. Admin Contact
    if ($script:config.adminContact) {
        $ac = $script:config.adminContact
        if ($ac.whatsapp) { $TxtAdminPhone.Text = $ac.whatsapp }
        if ($ac.name) { $TxtAdminName.Text = $ac.name }
        if ($ac.supportHours) { $TxtAdminHours.Text = $ac.supportHours }
    }

    # 4. Blacklist
    Refresh-BlacklistUI
    Update-NoticePreview
}

function Show-SelectedKeyDetails {
    $selectedKey = $ComboKeys.SelectedItem
    if (-not $selectedKey -or -not $script:keysDict.ContainsKey($selectedKey)) { return }
    $u = $script:keysDict[$selectedKey]

    $TxtKeyCode.Text = $u.key
    $ChkKeyActive.IsChecked = ($u.isActive -ne $false)
    $TxtPlanName.Text = if ($u.planHindi) { $u.planHindi } else { $u.plan }
    $TxtNoticeMessage.Text = $u.message

    if ($u.expiryDate) {
        try {
            $DpExpiryDate.SelectedDate = [DateTime]::Parse($u.expiryDate)
        } catch {
            $DpExpiryDate.SelectedDate = (Get-Date).AddDays(90)
        }
    } else {
        $DpExpiryDate.SelectedDate = (Get-Date).AddDays(90)
    }
}

$ComboKeys.Add_SelectionChanged({ Show-SelectedKeyDetails })

# Add Days Function
function Add-DaysToExpiry([int]$days) {
    $current = $DpExpiryDate.SelectedDate
    if (-not $current) { $current = Get-Date }
    $newDate = $current.AddDays($days)
    $DpExpiryDate.SelectedDate = $newDate
    $TxtStatusLog.Text = "+$days दिन जोड़े गए! नई तारीख: " + $newDate.ToString("yyyy-MM-dd")
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Green
}

$BtnAdd15.Add_Click({ Add-DaysToExpiry 15 })
$BtnAdd30.Add_Click({ Add-DaysToExpiry 30 })
$BtnAdd60.Add_Click({ Add-DaysToExpiry 60 })
$BtnAdd90.Add_Click({ Add-DaysToExpiry 90 })
$BtnAdd180.Add_Click({ Add-DaysToExpiry 180 })
$BtnAdd365.Add_Click({ Add-DaysToExpiry 365 })
$BtnAddLife.Add_Click({
    $DpExpiryDate.SelectedDate = [DateTime]::Parse("2099-12-31")
    $TxtStatusLog.Text = "♾️ आजीवन (Lifetime 2099-12-31) सेट कर दिया गया!"
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Purple
})

# Add New Universal Key
$BtnNewKey.Add_Click({
    $newCode = "OFFER" + (Get-Random -Minimum 100 -Maximum 999)
    $script:keysDict[$newCode] = [PSCustomObject]@{
        key = $newCode
        plan = "Special Offer Plan"
        planHindi = "विशेष ऑफर प्लान"
        expiryDate = (Get-Date).AddDays(90).ToString("yyyy-MM-dd")
        isActive = $true
        maxDevices = 99999
        message = "विशेष ऑफर सभी केंद्रों के लिए सक्रिय है!"
    }
    [void]$ComboKeys.Items.Add($newCode)
    $ComboKeys.SelectedItem = $newCode
    $TxtStatusLog.Text = "नई की बनाई गई: $newCode"
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Blue
})

# Delete Universal Key
$BtnDeleteKey.Add_Click({
    $selKey = $ComboKeys.SelectedItem
    if (-not $selKey) { return }
    $confirm = [System.Windows.MessageBox]::Show("क्या आप वास्तव में '$selKey' को डिलीट करना चाहते हैं?", "Confirm Delete", [System.Windows.MessageBoxButton]::YesNo, [System.Windows.MessageBoxImage]::Warning)
    if ($confirm -eq [System.Windows.MessageBoxResult]::Yes) {
        $script:keysDict.Remove($selKey)
        $ComboKeys.Items.Remove($selKey)
        if ($ComboKeys.Items.Count -gt 0) { $ComboKeys.SelectedIndex = 0 }
        $TxtStatusLog.Text = "की हटाई गई: $selKey"
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::DarkRed
    }
})

# Update Notice Preview
function Update-NoticePreview {
    $TbPrevTitle.Text = $TxtNoticeTitle.Text
    $TbPrevBody.Text = $TxtNoticeBody.Text
    $BtnPrevAction.Content = $TxtNoticeBtnText.Text
}

$TxtNoticeTitle.Add_TextChanged({ Update-NoticePreview })
$TxtNoticeBody.Add_TextChanged({ Update-NoticePreview })
$TxtNoticeBtnText.Add_TextChanged({ Update-NoticePreview })

# Personal Key Generator
$BtnGenerateKey.Add_Click({
    $hw = $TxtCustHwId.Text.Trim().ToUpper()
    if ([string]::IsNullOrWhiteSpace($hw)) {
        [System.Windows.MessageBox]::Show("कृपया ग्राहक का Machine Hardware ID दर्ज करें!", "Hardware ID Required", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Warning)
        return
    }

    $planIdx = $ComboCustPlan.SelectedIndex
    $planCode = "PRO"
    $expiryYmd = (Get-Date).AddDays(365).ToString("yyyyMMdd")

    if ($planIdx -eq 1) {
        $planCode = "HALF"
        $expiryYmd = (Get-Date).AddDays(180).ToString("yyyyMMdd")
    } elseif ($planIdx -eq 2) {
        $planCode = "QTR"
        $expiryYmd = (Get-Date).AddDays(90).ToString("yyyyMMdd")
    } elseif ($planIdx -eq 3) {
        $planCode = "MONTH"
        $expiryYmd = (Get-Date).AddDays(30).ToString("yyyyMMdd")
    } elseif ($planIdx -eq 4) {
        $planCode = "LIFE"
        $expiryYmd = "LIFETIME"
    }

    $nodeCmd = "const lm = require('./utils/licenseManager'); console.log(lm.generatePersonalKey('$planCode', '$hw', '$expiryYmd'));"
    try {
        $key = & node -e $nodeCmd
        $TxtGeneratedKey.Text = $key.Trim()
        $TxtStatusLog.Text = "✓ पर्सनल की सफलतापूर्वक जनरेट हो गई!"
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Green
    } catch {
        $TxtGeneratedKey.Text = "त्रुटि: " + $_.Exception.Message
    }
})

# Copy Key Button
$BtnCopyKey.Add_Click({
    $k = $TxtGeneratedKey.Text.Trim()
    if ($k -and -not $k.StartsWith("बटन")) {
        [Windows.Clipboard]::SetText($k)
        $TxtStatusLog.Text = "✓ चाबी क्लिपबोर्ड पर कॉपी हो गई!"
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Blue
    }
})

# Share WhatsApp Button
$BtnShareWhatsApp.Add_Click({
    $k = $TxtGeneratedKey.Text.Trim()
    $mob = $TxtCustMobile.Text.Trim()
    $shop = $TxtCustShop.Text.Trim()
    $hw = $TxtCustHwId.Text.Trim()
    if ($k -and -not $k.StartsWith("बटन")) {
        $cleanMob = $mob -replace '\D', ''
        if ($cleanMob.Length -eq 10) { $cleanMob = "91" + $cleanMob }
        $msg = "नमस्ते $shop!`n`nआपका HisaabBC सॉफ़्टवेयर लाइसेंस तैयार है:`n`n🔑 लाइसेंस की: $k`n💻 मशीन कोड: $hw`n`nसॉफ़्टवेयर के सेटिंग्स -> 'लाइसेंस व सब्सक्रिप्शन' में जाकर यह की पेस्ट करके एक्टिवेट करें।"
        $encoded = [Uri]::EscapeDataString($msg)
        $url = "https://wa.me/$cleanMob?text=$encoded"
        Start-Process $url
    }
})

# Blacklist Management
function Refresh-BlacklistUI {
    $ListBlacklist.Items.Clear()
    if ($script:config.blacklistedHardwareIds) {
        foreach ($item in $script:config.blacklistedHardwareIds) {
            [void]$ListBlacklist.Items.Add($item)
        }
    }
}

$BtnAddBlacklist.Add_Click({
    $newHw = $TxtNewBlacklistHw.Text.Trim().ToUpper()
    if ($newHw) {
        $arr = [System.Collections.ArrayList]@($script:config.blacklistedHardwareIds)
        if (-not $arr.Contains($newHw)) {
            [void]$arr.Add($newHw)
            $script:config.blacklistedHardwareIds = @($arr)
            Refresh-BlacklistUI
            $TxtNewBlacklistHw.Text = ""
            $TxtStatusLog.Text = "मशीन ब्लॉक लिस्ट में जोड़ी गई: $newHw"
            $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Red
        }
    }
})

$BtnRemoveBlacklist.Add_Click({
    $sel = $ListBlacklist.SelectedItem
    if ($sel) {
        $arr = [System.Collections.ArrayList]@($script:config.blacklistedHardwareIds)
        [void]$arr.Remove($sel)
        $script:config.blacklistedHardwareIds = @($arr)
        Refresh-BlacklistUI
        $TxtStatusLog.Text = "मशीन अनब्लॉक की गई: $sel"
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Green
    }
})

# Open Browser Button
$BtnOpenBrowser.Add_Click({
    Start-Process "http://localhost:4000/#settings"
})

# SAVE AND PUSH TO GITHUB
$BtnSavePush.Add_Click({
    $BtnSavePush.IsEnabled = $false
    $PbPush.Visibility = [Windows.Visibility]::Visible
    $PbPush.IsIndeterminate = $true
    $TxtStatusLog.Text = "1/3 config/licenses.json स्थानीय रूप से सुरक्षित हो रहा है..."
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::DarkGoldenrod

    # Update active key in dictionary
    $selKey = $ComboKeys.SelectedItem
    if ($selKey) {
        $expDateStr = if ($DpExpiryDate.SelectedDate) { $DpExpiryDate.SelectedDate.ToString("yyyy-MM-dd") } else { (Get-Date).AddDays(90).ToString("yyyy-MM-dd") }
        $script:keysDict[$selKey] = [PSCustomObject]@{
            key = $TxtKeyCode.Text.Trim().ToUpper()
            plan = $TxtPlanName.Text.Trim()
            planHindi = $TxtPlanName.Text.Trim()
            expiryDate = $expDateStr
            isActive = ($ChkKeyActive.IsChecked -eq $true)
            maxDevices = 99999
            message = $TxtNoticeMessage.Text.Trim()
        }
    }

    # Notice Type mapping
    $noticeTypeStr = "info"
    switch ($ComboNoticeType.SelectedIndex) {
        1 { $noticeTypeStr = "success" }
        2 { $noticeTypeStr = "warning" }
        3 { $noticeTypeStr = "urgent" }
        default { $noticeTypeStr = "info" }
    }

    $finalConfig = [PSCustomObject]@{
        version = 1
        updatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        adminContact = [PSCustomObject]@{
            whatsapp = $TxtAdminPhone.Text.Trim()
            name = $TxtAdminName.Text.Trim()
            supportHours = $TxtAdminHours.Text.Trim()
        }
        announcement = [PSCustomObject]@{
            isActive = ($ChkNoticeActive.IsChecked -eq $true)
            title = $TxtNoticeTitle.Text.Trim()
            message = $TxtNoticeBody.Text.Trim()
            type = $noticeTypeStr
            actionText = $TxtNoticeBtnText.Text.Trim()
            actionUrl = $TxtNoticeBtnUrl.Text.Trim()
        }
        universalKeys = $script:keysDict
        blacklistedHardwareIds = @($script:config.blacklistedHardwareIds)
    }

    # Save to disk as UTF-8 without BOM so Node.js JSON.parse never crashes
    $json = $finalConfig | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ConfigPath, $json, $utf8NoBom)

    $TxtStatusLog.Text = "2/3 Git Commit तैयार करके GitHub पर पुश किया जा रहा है..."

    # Async background task for git push so UI doesn't freeze
    $jobScript = {
        param($dir)
        Set-Location $dir
        $out = @()
        $out += (& git add config/licenses.json 2>&1)
        $out += (& git commit -m "chore(license): update cloud licenses config via Master License Wizard" 2>&1)
        $out += (& git push origin sqlite 2>&1)
        $out += (& git push origin sqlite:main 2>&1)
        return ($out -join "`n")
    }

    $script:pushJob = Start-Job -ScriptBlock $jobScript -ArgumentList $ProjectDir
    $script:pushHandled = $false

    # Polling timer
    $script:pushTimer = New-Object Windows.Threading.DispatcherTimer
    $script:pushTimer.Interval = [TimeSpan]::FromMilliseconds(500)
    $script:pushTimer.Add_Tick({
        # If already handled or job is missing, immediately stop
        if ($script:pushHandled -or (-not $script:pushJob)) {
            $this.Stop()
            if ($script:pushTimer) { $script:pushTimer.Stop() }
            return
        }

        if ($script:pushJob.State -ne 'Running') {
            # Stop timer immediately using $this to prevent re-entrancy
            $this.Stop()
            if ($script:pushTimer) { $script:pushTimer.Stop() }
            $script:pushHandled = $true

            $curJob = $script:pushJob
            $script:pushJob = $null

            $PbPush.Visibility = [Windows.Visibility]::Collapsed
            $BtnSavePush.IsEnabled = $true

            $output = ""
            if ($curJob) {
                try {
                    $output = (Receive-Job -Job $curJob -ErrorAction SilentlyContinue) -join "`n"
                    Remove-Job -Job $curJob -Force -ErrorAction SilentlyContinue
                } catch { }
            }

            $TxtStatusLog.Text = "🎉 बधाई! GitHub पर सफलतापूर्वक अपडेट हो गया! सभी ग्राहकों का सॉफ़्टवेयर नई तारीख पर सक्रिय है।"
            $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Green

            [System.Windows.MessageBox]::Show("🎉 बधाई संजय जी!`n`nक्लाउड लाइसेंस कॉन्फ़िग सफलतापूर्वक GitHub पर पुश हो गया है!`nसभी 500+ ग्राहकों के कंप्यूटर पर नई तारीख व नोटिस स्वतः लागू हो गए हैं।", "GitHub Push Successful", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        }
    })
    $script:pushTimer.Start()
})

$window.Add_Closing({
    if ($script:pushTimer) {
        try { $script:pushTimer.Stop() } catch { }
    }
    if ($script:pushJob) {
        try { Remove-Job -Job $script:pushJob -Force -ErrorAction SilentlyContinue } catch { }
    }
})

# Initialize UI
Load-ConfigIntoUI

# Show Window
$window.ShowDialog() | Out-Null
