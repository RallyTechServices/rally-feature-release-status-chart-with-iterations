Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    _features: {}, /* key will be objectid */
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSummary();
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');
        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox',
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                },
                ready: function(rb) {
                    this._asynch_return_flags = {};
                    //this._getSprints();
                    this._getStoriesInRelease();
                }
            }
        });
    },
    _getStoriesInRelease: function() {
        var me = this;
        this.logger.log(this,"_getStoriesInRelease");
        this._features = {};
        this._async_flags = {};
        
        var release = this.down('#releasebox').getRecord();
        var release_name = release.get('Name');
        
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'Release.Name',value:release_name}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,stories){
                    me.logger.log(this,"    ...got stories in release",stories.length);
                    Ext.Array.each(stories,function(story){  
                        if ( story.get('Parent') !== null ) {
                            me._async_flags[story.get('ObjectID')] = 1;
                            me._getTopLevelParent(story,story);
                        } else {
                            var plan_estimate = story.get('PlanEstimate') || 0;
                            story.set('total_planned',plan_estimate);
                            story.set('child_count',0);
                            
                            me._features[story.get('ObjectID')] = story;
                        }
                    });
                    this._makeChart();
                }
            }
        });
    },
    // keep track of calls as we spray a bunch of async calls looking for the most top level parent
    _getTopLevelParent: function(story,original_child) {
        this.logger.log(this,"_getTopLevelParent");
        var me = this;
        var fetch = ['PlanEstimate','Parent','Name','ObjectID'];
        var filters = [{property:'ObjectID',value:story.get('Parent').ObjectID}];
        Ext.create('Rally.data.WsapiDataStore',{
            model:'UserStory',
            autoLoad: true,
            filters: filters,
            fetch: fetch,
            listeners: {
                scope: this,
                load: function(store,parents){
                    Ext.Array.each(parents,function(parent){
                        if ( parent.get('Parent') !== null ) {
                            if ( story.get('ObjectID') !== original_child.get('ObjectID') ) {
                                delete me._async_flags[story.get('ObjectID')];
                            }
                            me._getTopLevelParent(parent,original_child);
                        } else {
                            delete me._async_flags[original_child.get('ObjectID')];
                            
                            var plan_estimate = original_child.get('PlanEstimate') || 0;
                            if ( me._features[parent.get('ObjectID')] ) {
                                var feature = me._features[parent.get('ObjectID')];
                                var feature_total = feature.get('total_planned');
                                
                                feature.set('total_planned',feature_total + plan_estimate);
                                feature.set('child_count',feature.get('child_count') + 1);

                            } else {
                                parent.set('total_planned', plan_estimate) ;
                                parent.set('child_count',1);
                                me._features[parent.get('ObjectID')] = parent;
                            }
                        }
                    });
                    me._makeChart();
                }
            }
        });
    },
    _sortFeatures: function(a,b) {
        var name_a = "";
        var name_b = "";
        
        if ( a && a.get('Name') ) {
            name_a = a.get('Name');
        }
        
        if ( b && b.get('Name') ) {
            name_b = b.get('Name');
        }
        return name_a.localeCompare(name_b);
    },
    _getChartData: function() {
        var me = this;
        this.logger.log(this,"_getChartData");
        var chart_data = [];
        
        var features = [];
        Ext.Object.each(me._features, function(feature_oid,feature){
            features.push(feature);
        });
       
        this.logger.log(this,"sorting features...");
        features.sort(me._sortFeatures);
        this.logger.log(this,"...done", features.length, "features");
        
        var data = [];
        var names = [];
        
        Ext.Array.each(features, function(feature){
            me.logger.log(me,feature.get('Name'), feature.get('child_count'));
            names.push(feature.get('Name'));
            data.push(feature.get('total_planned'));
        });
        
        
        
        var series = [
            {
                type: 'column',
                data: data,
                visible: true,
                name: 'Total Planned US Points'
            }
        ];
        return { series: series, categories: names };
    },
    _makeChart: function() {
        this.logger.log(this,"_makeChart");
        this.down('#chart_box').removeAll();
        
        if ( Ext.Object.getKeys(this._async_flags).length > 0 ) {
            this.logger.log(this,"Waiting for ", this._async_flags);
        } else {
            var chart_data = this._getChartData();
            
            if ( chart_data.categories.length === 0 ) {
                this.down('#chart_box').add({xtype:'container',html:'No Features found for selection.'});
            } else {
                this.down('#chart_box').add({
                    xtype:'rallychart',
                    chartData: {
                        categories: chart_data.categories,
                        series: chart_data.series
                    },
                    chartConfig: {
                        chart: { height: 600 },
                        title: { text: 'Feature Status', align: 'center' },
                        yAxis: [{
                            title: {
                                enabled: true,
                                text: 'Story Points',
                                style: { fontWeight: 'normal' }
                            }
                        }],
                        xAxis: [{
                            title: {
                                enabled: true,
                                text: 'Features'
                            },
                            categories: chart_data.categories,
                            labels: {
                                rotation: 90,
                                align: 'left'
                            }
                        }]
                    }
                });
            }
        }
    }
});