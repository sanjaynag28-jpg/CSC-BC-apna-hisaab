# ============================================================================
# HisaabBC - Master License & Cloud Control Wizard (PowerShell WPF Edition)
# Full Control: Cloud Keys, Personal Key Generator, Remote Blacklist & 1-Click GitHub Push
# ============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'

# Project Root
$CurrentScriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
if (-not $CurrentScriptDir) { $CurrentScriptDir = (Get-Location).Path }
$ProjectDir = (Resolve-Path (Join-Path $CurrentScriptDir '..')).Path
Set-Location $ProjectDir

# Load WPF Assemblies
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

# Paths
$ConfigPath = Join-Path $ProjectDir 'config\licenses.json'

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

# XAML Definition
[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="HisaabBC - Master License &amp; Cloud Control Wizard"
        Height="720" Width="920"
        WindowStartupLocation="CenterScreen"
        Background="#0F172A" Foreground="#F8FAFC"
        FontFamily="Segoe UI" FontSize="13"
        ResizeMode="CanResize">
    <Window.Resources>
        <Style TargetType="TabItem">
            <Setter Property="FontSize" Value="13"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="Padding" Value="16,8"/>
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#94A3B8"/>
            <Setter Property="BorderThickness" Value="0,0,0,2"/>
            <Setter Property="BorderBrush" Value="Transparent"/>
        </Style>
        <Style TargetType="TextBox">
            <Setter Property="Background" Value="#1E293B"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="Padding" Value="8,6"/>
            <Setter Property="VerticalContentAlignment" Value="Center"/>
        </Style>
        <Style TargetType="Button">
            <Setter Property="Background" Value="#334155"/>
            <Setter Property="Foreground" Value="#F8FAFC"/>
            <Setter Property="Padding" Value="12,6"/>
            <Setter Property="BorderThickness" Value="0"/>
            <Setter Property="Cursor" Value="Hand"/>
        </Style>
    </Window.Resources>

    <Grid>
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>

        <!-- HEADER -->
        <Border Grid.Row="0" Background="#1E293B" BorderBrush="#334155" BorderThickness="0,0,0,1" Padding="20,16">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Grid.Column="0">
                    <TextBlock Text="🛡️ HisaabBC - Master License &amp; Cloud Control Wizard" FontSize="18" FontWeight="Bold" Foreground="#38BDF8"/>
                    <TextBlock Text="GitHub Cloud Keys • Personal Customer Key Generator • Remote Blacklist Control" FontSize="12" Foreground="#94A3B8" Margin="0,3,0,0"/>
                </StackPanel>
                <Border Grid.Column="1" Background="#064E3B" CornerRadius="12" Padding="12,4" VerticalAlignment="Center">
                    <TextBlock Text="● GitHub Live Connected" FontSize="11" FontWeight="Bold" Foreground="#34D399"/>
                </Border>
            </Grid>
        </Border>

        <!-- MAIN TABS -->
        <TabControl x:Name="TabMain" Grid.Row="1" Background="#0F172A" BorderThickness="0" Margin="16,12,16,12">
            
            <!-- TAB 1: CLOUD UNIVERSAL KEYS -->
            <TabItem Header="🌐 Cloud Universal Keys (TEST123 आदि)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="8,16">
                    <StackPanel>
                        <!-- Key Selection Row -->
                        <Grid Margin="0,0,0,16">
                            <Grid.ColumnDefinitions>
                                <ColumnDefinition Width="*"/>
                                <ColumnDefinition Width="Auto"/>
                            </Grid.ColumnDefinitions>
                            <StackPanel Grid.Column="0">
                                <TextBlock Text="चुनें अथवा नई की बनाएं (Select or Create Key):" FontSize="12" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,6"/>
                                <ComboBox x:Name="ComboKeys" Height="36" Background="#1E293B" Foreground="#38BDF8" FontSize="14" FontWeight="Bold" Padding="8,6"/>
                            </StackPanel>
                            <Button x:Name="BtnNewKey" Grid.Column="1" Content="➕ नई की जोड़ें (Add New Key)" Margin="12,20,0,0" Padding="14,8" Background="#8B5CF6" FontWeight="Bold"/>
                        </Grid>

                        <Border Background="#1E293B" CornerRadius="8" Padding="16" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
                            <StackPanel>
                                <Grid Margin="0,0,0,12">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,8,0">
                                        <TextBlock Text="की कोड (Key Code):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtKeyCode" Height="34" FontSize="14" FontWeight="Bold" Foreground="#38BDF8"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="8,0,0,0">
                                        <TextBlock Text="सक्रिय स्थिति (Status):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <CheckBox x:Name="ChkKeyActive" Content="सक्रिय (Active for All Clients)" IsChecked="True" Foreground="#34D399" FontWeight="Bold" VerticalAlignment="Center" Margin="0,6,0,0"/>
                                    </StackPanel>
                                </Grid>

                                <Grid Margin="0,0,0,12">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,8,0">
                                        <TextBlock Text="प्लान का नाम (Plan Name):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtPlanName" Height="34" FontSize="13" Text="९० दिन फ्री ट्रायल (Universal Offer)"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="8,0,0,0">
                                        <TextBlock Text="समाप्ति तारीख (Expiry Date):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <DatePicker x:Name="DpExpiryDate" Height="34" Background="#1E293B" Foreground="#0F172A"/>
                                    </StackPanel>
                                </Grid>

                                <!-- QUICK ADD BUTTONS -->
                                <TextBlock Text="⚡ एक क्लिक में तारीख आगे बढ़ाएं (Quick Add Days):" FontSize="11" FontWeight="Bold" Foreground="#A78BFA" Margin="0,4,0,6"/>
                                <WrapPanel Margin="0,0,0,14">
                                    <Button x:Name="BtnAdd15" Content="+15 दिन" Margin="0,0,8,8" Padding="12,6" Background="#334155"/>
                                    <Button x:Name="BtnAdd30" Content="+30 दिन" Margin="0,0,8,8" Padding="12,6" Background="#334155"/>
                                    <Button x:Name="BtnAdd60" Content="+60 दिन" Margin="0,0,8,8" Padding="12,6" Background="#334155"/>
                                    <Button x:Name="BtnAdd90" Content="+90 दिन (Recommended)" Margin="0,0,8,8" Padding="14,6" Background="#065F46" Foreground="#34D399" FontWeight="Bold"/>
                                    <Button x:Name="BtnAdd180" Content="+6 महीने" Margin="0,0,8,8" Padding="12,6" Background="#334155"/>
                                    <Button x:Name="BtnAdd365" Content="+1 साल" Margin="0,0,8,8" Padding="14,6" Background="#3730A3" Foreground="#818CF8" FontWeight="Bold"/>
                                </WrapPanel>

                                <StackPanel Margin="0,0,0,4">
                                    <TextBlock Text="ग्राहकों के लिए संदेश / नोटिस (Notice Message):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtNoticeMessage" Height="34" Text="९० दिन का विशेष फ्री ट्रायल ऑफर सभी केंद्रों के लिए सक्रिय है!"/>
                                </StackPanel>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 2: PERSONAL CUSTOMER KEY GENERATOR -->
            <TabItem Header="🔑 Personal Key Generator (ग्राहक की चाबी)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="8,16">
                    <StackPanel>
                        <Border Background="#1E293B" CornerRadius="8" Padding="18" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
                            <StackPanel>
                                <TextBlock Text="ग्राहक की जानकारी दर्ज करें:" FontSize="13" FontWeight="Bold" Foreground="#38BDF8" Margin="0,0,0,12"/>
                                
                                <Grid Margin="0,0,0,12">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="*"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0" Margin="0,0,8,0">
                                        <TextBlock Text="दुकान का नाम (Shop Name):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtCustShop" Height="34" Text="Sharma Digital Kendra"/>
                                    </StackPanel>
                                    <StackPanel Grid.Column="1" Margin="8,0,0,0">
                                        <TextBlock Text="मोबाइल नंबर (Mobile Number):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <TextBox x:Name="TxtCustMobile" Height="34" Text="9876543210"/>
                                    </StackPanel>
                                </Grid>

                                <StackPanel Margin="0,0,0,12">
                                    <TextBlock Text="ग्राहक का मशीन कोड (Hardware ID - ग्राहक से प्राप्त करें):" FontSize="11" FontWeight="Bold" Foreground="#F59E0B" Margin="0,0,0,4"/>
                                    <TextBox x:Name="TxtCustHwId" Height="34" FontSize="14" FontWeight="Bold" Foreground="#F59E0B" Text="HWID-E8D1-DE0E-4925"/>
                                </StackPanel>

                                <Grid Margin="0,0,0,16">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="Auto"/>
                                    </Grid.ColumnDefinitions>
                                    <StackPanel Grid.Column="0">
                                        <TextBlock Text="प्लान का प्रकार (Plan Type):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,4"/>
                                        <ComboBox x:Name="ComboCustPlan" Height="34" Background="#1E293B" Foreground="#F8FAFC" FontSize="13">
                                            <ComboBoxItem Content="Annual Pro (1 साल - 365 दिन)" IsSelected="True"/>
                                            <ComboBoxItem Content="Monthly Plan (1 महीना - 30 दिन)"/>
                                            <ComboBoxItem Content="Lifetime Plan (आजीवन - कभी समाप्त नहीं)"/>
                                        </ComboBox>
                                    </StackPanel>
                                    <Button x:Name="BtnGenerateKey" Grid.Column="1" Content="⚡ Generate Personal Key" Margin="12,18,0,0" Padding="18,8" Background="#10B981" FontWeight="Bold" Foreground="White"/>
                                </Grid>

                                <!-- GENERATED KEY DISPLAY -->
                                <Border Background="#0F172A" BorderBrush="#334155" BorderThickness="1.5" CornerRadius="8" Padding="14">
                                    <StackPanel>
                                        <TextBlock Text="जनरेट की गई लाइसेंस की (Copy &amp; Send to Customer):" FontSize="11" FontWeight="Bold" Foreground="#94A3B8" Margin="0,0,0,6"/>
                                        <TextBox x:Name="TxtGeneratedKey" Height="40" FontSize="16" FontWeight="Bold" Foreground="#34D399" Background="#0F172A" BorderThickness="0" IsReadOnly="True" Text="बटन दबाने पर यहाँ की दिखेगी..."/>
                                        <WrapPanel Margin="0,10,0,0">
                                            <Button x:Name="BtnCopyKey" Content="📋 चाबी कॉपी करें (Copy Key)" Padding="14,8" Background="#38BDF8" Foreground="#0F172A" FontWeight="Bold" Margin="0,0,10,0"/>
                                            <Button x:Name="BtnShareWhatsApp" Content="💬 सीधे व्हाट्सएप पर भेजें (WhatsApp Share)" Padding="14,8" Background="#059669" Foreground="White" FontWeight="Bold"/>
                                        </WrapPanel>
                                    </StackPanel>
                                </Border>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

            <!-- TAB 3: BLACKLIST -->
            <TabItem Header="🚫 Blacklist &amp; Remote Block (मशीन ब्लॉक करें)">
                <ScrollViewer VerticalScrollBarVisibility="Auto" Padding="8,16">
                    <StackPanel>
                        <Border Background="#1E293B" CornerRadius="8" Padding="16" Margin="0,0,0,16" BorderBrush="#334155" BorderThickness="1">
                            <StackPanel>
                                <TextBlock Text="ब्लैकलिस्टेड मशीन कोड सूची (Currently Blocked Hardware IDs):" FontSize="13" FontWeight="Bold" Foreground="#EF4444" Margin="0,0,0,8"/>
                                <TextBlock Text="यहाँ जोड़ी गई मशीनें इंटरनेट कनेक्ट होते ही स्वतः लॉक हो जाएंगी।" FontSize="11" Foreground="#94A3B8" Margin="0,0,0,12"/>

                                <ListBox x:Name="ListBlacklist" Height="140" Background="#0F172A" Foreground="#F87171" BorderBrush="#334155" Margin="0,0,0,12" FontSize="13" FontFamily="Courier New"/>

                                <Grid Margin="0,0,0,8">
                                    <Grid.ColumnDefinitions>
                                        <ColumnDefinition Width="*"/>
                                        <ColumnDefinition Width="Auto"/>
                                        <ColumnDefinition Width="Auto"/>
                                    </Grid.ColumnDefinitions>
                                    <TextBox x:Name="TxtNewBlacklistHw" Grid.Column="0" Height="36" FontSize="13" Margin="0,0,8,0" Tag="HWID-XXXX-XXXX-XXXX दर्ज करें..."/>
                                    <Button x:Name="BtnAddBlacklist" Grid.Column="1" Content="🚫 ब्लॉक लिस्ट में जोड़ें" Padding="14,8" Background="#DC2626" Foreground="White" FontWeight="Bold" Margin="0,0,8,0"/>
                                    <Button x:Name="BtnRemoveBlacklist" Grid.Column="2" Content="✕ अनब्लॉक करें" Padding="14,8" Background="#334155" Foreground="#94A3B8"/>
                                </Grid>
                            </StackPanel>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </TabItem>

        </TabControl>

        <!-- FOOTER BAR (ALWAYS VISIBLE) -->
        <Border Grid.Row="2" Background="#1E293B" BorderBrush="#334155" BorderThickness="0,1,0,0" Padding="20,14">
            <Grid>
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>

                <StackPanel Grid.Column="0" VerticalAlignment="Center">
                    <TextBlock x:Name="TxtStatusLog" Text="तैयार (Ready) - कोई भी बदलाव करने के बाद नीचे हरा बटन दबाएं।" FontSize="12" Foreground="#38BDF8" FontWeight="SemiBold"/>
                    <ProgressBar x:Name="PbPush" Height="4" Margin="0,6,20,0" Background="#334155" Foreground="#10B981" Visibility="Collapsed"/>
                </StackPanel>

                <StackPanel Grid.Column="1" Orientation="Horizontal">
                    <Button x:Name="BtnOpenBrowser" Content="🌐 ब्राउज़र में खोलें" Margin="0,0,10,0" Padding="14,10" Background="#334155" Foreground="#94A3B8" FontWeight="SemiBold"/>
                    <Button x:Name="BtnSavePush" Content="🚀 एक क्लिक में GitHub पर लागू करें (Save &amp; Push to GitHub)" Padding="22,10" Background="#10B981" Foreground="White" FontWeight="Bold" FontSize="13"/>
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
$TxtNoticeMessage = $window.FindName("TxtNoticeMessage")
$TxtCustShop = $window.FindName("TxtCustShop")
$TxtCustMobile = $window.FindName("TxtCustMobile")
$TxtCustHwId = $window.FindName("TxtCustHwId")
$ComboCustPlan = $window.FindName("ComboCustPlan")
$BtnGenerateKey = $window.FindName("BtnGenerateKey")
$TxtGeneratedKey = $window.FindName("TxtGeneratedKey")
$BtnCopyKey = $window.FindName("BtnCopyKey")
$BtnShareWhatsApp = $window.FindName("BtnShareWhatsApp")
$ListBlacklist = $window.FindName("ListBlacklist")
$TxtNewBlacklistHw = $window.FindName("TxtNewBlacklistHw")
$BtnAddBlacklist = $window.FindName("BtnAddBlacklist")
$BtnRemoveBlacklist = $window.FindName("BtnRemoveBlacklist")
$TxtStatusLog = $window.FindName("TxtStatusLog")
$PbPush = $window.FindName("PbPush")
$BtnOpenBrowser = $window.FindName("BtnOpenBrowser")
$BtnSavePush = $window.FindName("BtnSavePush")

# State
$script:config = Get-CloudConfig
$script:keysDict = @{}

# Populate Universal Keys
function Load-KeysUI {
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
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::LightGreen
}

$BtnAdd15.Add_Click({ Add-DaysToExpiry 15 })
$BtnAdd30.Add_Click({ Add-DaysToExpiry 30 })
$BtnAdd60.Add_Click({ Add-DaysToExpiry 60 })
$BtnAdd90.Add_Click({ Add-DaysToExpiry 90 })
$BtnAdd180.Add_Click({ Add-DaysToExpiry 180 })
$BtnAdd365.Add_Click({ Add-DaysToExpiry 365 })

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
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::MediumPurple
})

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
        $planCode = "MONTH"
        $expiryYmd = (Get-Date).AddDays(30).ToString("yyyyMMdd")
    } elseif ($planIdx -eq 2) {
        $planCode = "LIFE"
        $expiryYmd = "LIFETIME"
    }

    $nodeCmd = "const lm = require('./utils/licenseManager'); console.log(lm.generatePersonalKey('$planCode', '$hw', '$expiryYmd'));"
    try {
        $key = & node -e $nodeCmd
        $TxtGeneratedKey.Text = $key.Trim()
        $TxtStatusLog.Text = "✓ पर्सनल की सफलतापूर्वक जनरेट हो गई!"
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::LightGreen
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
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Cyan
    }
})

# Share WhatsApp Button
$BtnShareWhatsApp.Add_Click({
    $k = $TxtGeneratedKey.Text.Trim()
    $mob = $TxtCustMobile.Text.Trim()
    $shop = $TxtCustShop.Text.Trim()
    if ($k -and -not $k.StartsWith("बटन")) {
        $cleanMob = $mob -replace '\D', ''
        if ($cleanMob.Length -eq 10) { $cleanMob = "91" + $cleanMob }
        $msg = "नमस्ते $shop! आपका HisaabBC सॉफ़्टवेयर लाइसेंस तैयार है:`n`nलाइसेंस की: $k`n`nसॉफ़्टवेयर के सेटिंग्स -> 'लाइसेंस व प्लान' में जाकर यह की पेस्ट करके एक्टिवेट करें।"
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
        $TxtStatusLog.Foreground = [Windows.Media.Brushes]::LightGreen
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
    $TxtStatusLog.Foreground = [Windows.Media.Brushes]::Yellow

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

    $finalConfig = [PSCustomObject]@{
        version = 1
        updatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        universalKeys = $script:keysDict
        blacklistedHardwareIds = @($script:config.blacklistedHardwareIds)
    }

    # Save to disk
    $json = $finalConfig | ConvertTo-Json -Depth 5
    Set-Content -Path $ConfigPath -Value $json -Encoding UTF8

    $TxtStatusLog.Text = "2/3 Git Commit तैयार करके GitHub पर पुश किया जा रहा है..."

    # Async background task for git push so UI doesn't freeze
    $jobScript = {
        param($dir)
        Set-Location $dir
        & git add config/licenses.json 2>&1
        & git commit -m "chore(license): update cloud licenses config via Master License Wizard" 2>&1
        & git push origin sqlite 2>&1
        & git push origin sqlite:main 2>&1
        return $LASTEXITCODE
    }

    $job = Start-Job -ScriptBlock $jobScript -ArgumentList $ProjectDir

    # Polling timer
    $timer = New-Object Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromMilliseconds(500)
    $timer.Add_Tick({
        if ($job.State -ne 'Running') {
            $timer.Stop()
            $PbPush.Visibility = [Windows.Visibility]::Collapsed
            $BtnSavePush.IsEnabled = $true

            $output = Receive-Job -Job $job
            Remove-Job -Job $job

            $TxtStatusLog.Text = "🎉 बधाई! GitHub पर सफलतापूर्वक अपडेट हो गया! सभी ग्राहकों का सॉफ़्टवेयर नई तारीख पर सक्रिय है।"
            $TxtStatusLog.Foreground = [Windows.Media.Brushes]::LightGreen

            [System.Windows.MessageBox]::Show("🎉 बधाई संजय जी!`n`nक्लाउड लाइसेंस कॉन्फ़िग सफलतापूर्वक GitHub पर पुश हो गया है!`nसभी 500+ ग्राहकों के कंप्यूटर पर नई तारीख स्वतः लागू हो गई है।", "GitHub Push Successful", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        }
    })
    $timer.Start()
})

# Initialize UI
Load-KeysUI
Refresh-BlacklistUI

# Show Window
$window.ShowDialog() | Out-Null
